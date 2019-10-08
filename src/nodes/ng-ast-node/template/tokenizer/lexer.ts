/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as chars from './chars'
import { ParseError } from './parse_util'

import { DEFAULT_INTERPOLATION_CONFIG, InterpolationConfig } from './interpolation_config'
import { NAMED_ENTITIES, TagContentType, TagDefinition } from './tags'
import { concatErrors, getLastElement } from '../../../../utils'
import { LocationFile, LocationPointer, LocationSpan } from '../../location'

export enum TokenType {
  TAG_OPEN_START,
  TAG_OPEN_END,
  TAG_OPEN_END_VOID,
  TAG_CLOSE,
  TEXT,
  ESCAPABLE_RAW_TEXT,
  RAW_TEXT,
  COMMENT_START,
  COMMENT_END,
  CDATA_START,
  CDATA_END,
  ATTR_NAME,
  ATTR_EQUAL,
  ATTR_QUOTE,
  ATTR_VALUE,
  DOC_TYPE,
  EXPANSION_FORM_START,
  EXPANSION_CASE_VALUE,
  EXPANSION_CASE_EXP_START,
  EXPANSION_CASE_EXP_END,
  EXPANSION_FORM_END,
  EOF,
  TRIVIA,
}

export function getTokenTypeName (tokenType: TokenType | undefined | null): string {
  if (tokenType == null) return `[null]`
  return TokenType[tokenType]
}

let id = 0

export class Token<Type extends TokenType = any> {

  private id = id++

  private _isForgotten: boolean = false

  constructor (
    public type: Type | null,
    public parts: string[],
    public locationSpan: LocationSpan,
  ) {
  }

  public get typeName (): string {
    return getTokenTypeName(this.type)
  }

  public toString (): string {
    return this.locationSpan.toString()
  }

  public printForDebug (): string {
    return `Token ${this.id.toString(10).padStart(3)} (${this.typeName.padStart(20)}) :: "${this}", ${this.locationSpan.printMedium()}`
  }

  /**
   * When a token is not a part of the source code anymore, the class instance still remains in memory
   * if consumer code is storing it somewhere. If the consumer accidentally performs any action on it,
   * it would be undefined behavior. Hence, all operations over tokens will need to firstly check if a
   * token is forgotten or not. This is also a public function so the consumer code can easily test if
   * there's a leftover token somewhere in code.
   */
  public isForgotten (): boolean {
    return this._isForgotten
  }

  /**
   * Throws if the token is forgotten.
   *
   * @see isForgotten
   * @param errorMessage - Additional details for the error message.
   */
  public assertNotForgotten (errorMessage?: string): void {
    if (this.isForgotten()) {
      const mainErrorMessage = `Expected ${this.printForDebug()} not to have been forgotten.`
      const error = concatErrors(mainErrorMessage, errorMessage)
      throw new Error(error)
    }
  }

  /**
   * @internal
   *
   * Marks the token as forgotten.
   */
  public _forget (): void {
    this._isForgotten = true
  }

}

export class TokenError extends ParseError {
  constructor (errorMsg: string, public tokenType: TokenType | null, span: LocationSpan) {
    super(span, errorMsg)
  }
}

export class TokenizeResult {
  constructor (public tokens: Token[], public errors: TokenError[]) {
  }
}

export interface LexerRange {
  startPos: number;
  startLine: number;
  startCol: number;
  endPos: number;
}

/**
 * Options that modify how the text is tokenized.
 */
export interface TokenizeOptions {
  /** Whether to tokenize ICU messages (considered as text nodes when false). */
  tokenizeExpansionForms?: boolean;
  /** How to tokenize interpolation markers. */
  interpolationConfig?: InterpolationConfig;
  /**
   * The start and end point of the text to parse within the `source` string.
   * The entire `source` string is parsed if this is not provided.
   * */
  range?: LexerRange;
  /**
   * If this text is stored in a JavaScript string, then we have to deal with escape sequences.
   *
   * **Example 1:**
   *
   * ```
   * "abc\"def\nghi"
   * ```
   *
   * - The `\"` must be converted to `"`.
   * - The `\n` must be converted to a new line character in a token,
   *   but it should not increment the current line for source mapping.
   *
   * **Example 2:**
   *
   * ```
   * "abc\
   *  def"
   * ```
   *
   * The line continuation (`\` followed by a newline) should be removed from a token
   * but the new line should increment the current line for source mapping.
   */
  escapedString?: boolean;
  /**
   * An array of characters that should be considered as leading trivia.
   * Leading trivia are characters that are not important to the developer, and so should not be
   * included in source-map segments.  A common example is whitespace.
   */
  leadingTriviaChars?: string[];
}

export function tokenize (
  source: string,
  url: string,
  getTagDefinition: (tagName: string) => TagDefinition,
  options: TokenizeOptions = {},
): TokenizeResult {
  return new _Tokenizer(new LocationFile(url, source), getTagDefinition, options).tokenize()
}

const _CR_OR_CRLF_REGEXP = /\r\n?/g

function _unexpectedCharacterErrorMsg (charCode: number): string {
  const char = charCode === chars.$EOF ? 'EOF' : String.fromCharCode(charCode)
  return `Unexpected character "${char}"`
}

function _unknownEntityErrorMsg (entitySrc: string): string {
  return `Unknown entity "${entitySrc}" - use the "&#<decimal>;" or  "&#x<hex>;" syntax`
}

class _ControlFlowError {
  constructor (public error: TokenError) {
  }
}

// See http://www.w3.org/TR/html51/syntax.html#writing
class _Tokenizer {
  private _cursor: CharacterCursor
  private _tokenizeIcu: boolean
  private _interpolationConfig: InterpolationConfig
  private _leadingTriviaCodePoints: number[] | undefined
  private _currentTokenStart: CharacterCursor | null = null
  private _currentTokenType: TokenType | null = null
  private _expansionCaseStack: TokenType[] = []
  private _inInterpolation: boolean = false
  tokens: Token[] = []
  errors: TokenError[] = []

  /**
   * @param _file The html source file being tokenized.
   * @param _getTagDefinition A function that will retrieve a tag definition for a given tag name.
   * @param options Configuration of the tokenization.
   */
  constructor (
    _file: LocationFile,
    private _getTagDefinition: (tagName: string) => TagDefinition,
    options: TokenizeOptions,
  ) {
    this._tokenizeIcu = options.tokenizeExpansionForms || false
    this._interpolationConfig = options.interpolationConfig || DEFAULT_INTERPOLATION_CONFIG
    this._leadingTriviaCodePoints =
      options.leadingTriviaChars && options.leadingTriviaChars.map(c => c.codePointAt(0) || 0)
    const range =
      options.range || { endPos: _file.getContent().length, startPos: 0, startLine: 0, startCol: 0 }
    this._cursor = options.escapedString ? new EscapedCharacterCursor(_file, range) :
      new PlainCharacterCursor(_file, range)
    try {
      this._cursor.init()
    } catch (e) {
      this.handleError(e)
    }
  }

  private _processCarriageReturns (content: string): string {
    // http://www.w3.org/TR/html5/syntax.html#preprocessing-the-input-stream
    // In order to keep the original position in the source, we can not
    // pre-process it.
    // Instead CRs are processed right before instantiating the tokens.
    return content.replace(_CR_OR_CRLF_REGEXP, '\n')
  }

  tokenize (): TokenizeResult {
    while (this._cursor.peek() !== chars.$EOF) {
      const start = this._cursor.clone()
      try {
        if (this._attemptCharCode(chars.$LT)) {
          if (this._attemptCharCode(chars.$BANG)) {
            if (this._attemptCharCode(chars.$LBRACKET)) {
              this._consumeCdata(start)
            } else if (this._attemptCharCode(chars.$MINUS)) {
              this._consumeComment(start)
            } else {
              this._consumeDocType(start)
            }
          } else if (this._attemptCharCode(chars.$SLASH)) {
            this._consumeTagClose(start)
          } else {
            this._consumeTagOpen(start)
          }
        } else if (!(this._tokenizeIcu && this._tokenizeExpansionForm())) {
          this._consumeText()
        }
      } catch (e) {
        this.handleError(e)
      }
    }
    this._beginToken(TokenType.EOF)
    this._endToken([])
    return new TokenizeResult(mergeTextTokens(this.tokens), this.errors)
  }

  /**
   * @returns whether an ICU token has been created
   * @internal
   */
  private _tokenizeExpansionForm (): boolean {
    if (this.isExpansionFormStart()) {
      this._consumeExpansionFormStart()
      return true
    }

    if (isExpansionCaseStart(this._cursor.peek()) && this._isInExpansionForm()) {
      this._consumeExpansionCaseStart()
      return true
    }

    if (this._cursor.peek() === chars.$RBRACE) {
      if (this._isInExpansionCase()) {
        this._consumeExpansionCaseEnd()
        return true
      }

      if (this._isInExpansionForm()) {
        this._consumeExpansionFormEnd()
        return true
      }
    }

    return false
  }

  private _beginToken (type: TokenType, start = this._cursor.clone()) {
    this._currentTokenStart = start
    this._currentTokenType = type
  }

  private _endToken (parts: string[], end = this._cursor.clone()): Token {
    if (this._currentTokenStart === null) {
      const errorMessage = `Programming error - attempted to end a token when there was no start to the token`
      throw new TokenError(errorMessage, this._currentTokenType, this._cursor.getSpan(end))
    }
    if (this._currentTokenType === null) {
      throw new TokenError(
        'Programming error - attempted to end a token which has no token type', null,
        this._cursor.getSpan(this._currentTokenStart))
    }
    const sourceSpan = this._cursor.getSpan(this._currentTokenStart, this._leadingTriviaCodePoints)
    const token = new Token(this._currentTokenType, parts, sourceSpan)
    this.tokens.push(token)
    this._currentTokenStart = null
    this._currentTokenType = null
    return token
  }

  private _createError (msg: string, span: LocationSpan): _ControlFlowError {
    if (this._isInExpansionForm()) {
      msg += ` (Do you have an unescaped "{" in your template? Use "{{ '{' }}") to escape it.)`
    }
    const error = new TokenError(msg, this._currentTokenType, span)
    this._currentTokenStart = null
    this._currentTokenType = null
    return new _ControlFlowError(error)
  }

  private handleError (e: any) {
    if (e instanceof CursorError) {
      e = this._createError(e.msg, this._cursor.getSpan(e.cursor))
    }
    if (e instanceof _ControlFlowError) {
      this.errors.push(e.error)
    } else {
      throw e
    }
  }

  private _attemptCharCode (charCode: number): boolean {
    if (this._cursor.peek() === charCode) {
      this._cursor.advance()
      return true
    }
    return false
  }

  private _attemptCharCodeCaseInsensitive (charCode: number): boolean {
    if (compareCharCodeCaseInsensitive(this._cursor.peek(), charCode)) {
      this._cursor.advance()
      return true
    }
    return false
  }

  private _requireCharCode (charCode: number) {
    const location = this._cursor.clone()
    if (!this._attemptCharCode(charCode)) {
      throw this._createError(
        _unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(location))
    }
  }

  private _attemptStr (chars: string): boolean {
    const len = chars.length
    if (this._cursor.charsLeft() < len) {
      return false
    }
    const initialPosition = this._cursor.clone()
    for (let i = 0; i < len; i++) {
      if (!this._attemptCharCode(chars.charCodeAt(i))) {
        // If attempting to parse the string fails, we want to reset the parser
        // to where it was before the attempt
        this._cursor = initialPosition
        return false
      }
    }
    return true
  }

  private _attemptStrCaseInsensitive (chars: string): boolean {
    for (let i = 0; i < chars.length; i++) {
      if (!this._attemptCharCodeCaseInsensitive(chars.charCodeAt(i))) {
        return false
      }
    }
    return true
  }

  private _requireStr (chars: string) {
    const location = this._cursor.clone()
    if (!this._attemptStr(chars)) {
      throw this._createError(
        _unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(location))
    }
  }

  private _attemptCharCodeUntilFn (predicate: (code: number) => boolean) {
    while (!predicate(this._cursor.peek())) {
      this._cursor.advance()
    }
  }

  private _consumeTriviaWhitespace () {
    const start = this._cursor.clone()
    while (!isNotWhitespace(this._cursor.peek())) {
      this._cursor.advance()
    }
    const diff = this._cursor.diff(start)
    if (diff == 0) return
    this._beginToken(TokenType.TRIVIA, start)
    const part = this._cursor.getSpan(start).toString()
    this._endToken([part])
  }

  private _requireCharCodeUntilFn (predicate: (code: number) => boolean, len: number) {
    const start = this._cursor.clone()
    this._attemptCharCodeUntilFn(predicate)
    const end = this._cursor.clone()
    if (end.diff(start) < len) {
      throw this._createError(
        _unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(start))
    }
  }

  private _attemptUntilChar (char: number) {
    while (this._cursor.peek() !== char) {
      this._cursor.advance()
    }
  }

  private _readChar (decodeEntities: boolean): string {
    if (decodeEntities && this._cursor.peek() === chars.$AMPERSAND) {
      return this._decodeEntity()
    } else {
      // Don't rely upon reading directly from `_input` as the actual char value
      // may have been generated from an escape sequence.
      const char = String.fromCodePoint(this._cursor.peek())
      this._cursor.advance()
      return char
    }
  }

  private _decodeEntity (): string {
    const start = this._cursor.clone()
    this._cursor.advance()
    if (this._attemptCharCode(chars.$HASH)) {
      const isHex = this._attemptCharCode(chars.$x) || this._attemptCharCode(chars.$X)
      const codeStart = this._cursor.clone()
      this._attemptCharCodeUntilFn(isDigitEntityEnd)
      if (this._cursor.peek() != chars.$SEMICOLON) {
        throw this._createError(
          _unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan())
      }
      const strNum = this._cursor.getChars(codeStart)
      this._cursor.advance()
      try {
        const charCode = parseInt(strNum, isHex ? 16 : 10)
        return String.fromCharCode(charCode)
      } catch {
        throw this._createError(
          _unknownEntityErrorMsg(this._cursor.getChars(start)), this._cursor.getSpan())
      }
    } else {
      const nameStart = this._cursor.clone()
      this._attemptCharCodeUntilFn(isNamedEntityEnd)
      if (this._cursor.peek() != chars.$SEMICOLON) {
        this._cursor = nameStart
        return '&'
      }
      const name = this._cursor.getChars(nameStart)
      this._cursor.advance()
      const char = NAMED_ENTITIES[name]
      if (!char) {
        throw this._createError(_unknownEntityErrorMsg(name), this._cursor.getSpan(start))
      }
      return char
    }
  }

  private _consumeRawText (decodeEntities: boolean, endMarkerPredicate: () => boolean): Token {
    this._beginToken(decodeEntities ? TokenType.ESCAPABLE_RAW_TEXT : TokenType.RAW_TEXT)
    const parts: string[] = []
    while (true) {
      const tagCloseStart = this._cursor.clone()
      const foundEndMarker = endMarkerPredicate()
      this._cursor = tagCloseStart
      if (foundEndMarker) {
        break
      }
      parts.push(this._readChar(decodeEntities))
    }
    return this._endToken([this._processCarriageReturns(parts.join(''))])
  }

  private _consumeComment (start: CharacterCursor) {
    this._beginToken(TokenType.COMMENT_START, start)
    this._requireCharCode(chars.$MINUS)
    this._endToken([])
    this._consumeRawText(false, () => this._attemptStr('-->'))
    this._beginToken(TokenType.COMMENT_END)
    this._requireStr('-->')
    this._endToken([])
  }

  private _consumeCdata (start: CharacterCursor) {
    this._beginToken(TokenType.CDATA_START, start)
    this._requireStr('CDATA[')
    this._endToken([])
    this._consumeRawText(false, () => this._attemptStr(']]>'))
    this._beginToken(TokenType.CDATA_END)
    this._requireStr(']]>')
    this._endToken([])
  }

  private _consumeDocType (start: CharacterCursor) {
    this._beginToken(TokenType.DOC_TYPE, start)
    const contentStart = this._cursor.clone()
    this._attemptUntilChar(chars.$GT)
    const content = this._cursor.getChars(contentStart)
    this._cursor.advance()
    this._endToken([content])
  }

  private _consumePrefixAndColonAndName (): string[] {
    const nameOrPrefixStart = this._cursor.clone()
    let prefix: string = ''
    while (this._cursor.peek() !== chars.$COLON && !isPrefixEnd(this._cursor.peek())) {
      this._cursor.advance()
    }
    let nameStart: CharacterCursor
    if (this._cursor.peek() === chars.$COLON) {
      prefix = this._cursor.getChars(nameOrPrefixStart)
      this._cursor.advance()
      nameStart = this._cursor.clone()
    } else {
      nameStart = nameOrPrefixStart
    }
    this._requireCharCodeUntilFn(isNameEnd, prefix === '' ? 0 : 1)
    const name = this._cursor.getChars(nameStart)
    const colon = prefix == '' ? '' : ':'
    return [prefix, colon, name]
  }

  private _consumeTagOpen (start: CharacterCursor) {
    let tagName: string
    let prefix: string
    let openTagToken: Token | undefined
    let tokensBeforeTagOpen = this.tokens.length
    const innerStart = this._cursor.clone()
    try {
      if (!chars.isAsciiLetter(this._cursor.peek())) {
        throw this._createError(
          _unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(start))
      }

      openTagToken = this._consumeTagOpenStart(start)
      prefix = openTagToken.parts[0]
      tagName = openTagToken.parts[1]
      this._consumeTriviaWhitespace()
      while (this._cursor.peek() !== chars.$SLASH && this._cursor.peek() !== chars.$GT) {
        this._consumeAttributeName()
        this._consumeTriviaWhitespace()
        const cursorBeforeEq = this._cursor.clone()
        if (this._attemptCharCode(chars.$EQ)) {
          this._beginToken(TokenType.ATTR_EQUAL, cursorBeforeEq)
          this._endToken(['='])
          this._consumeTriviaWhitespace()
          this._consumeAttributeValue()
        }
        this._consumeTriviaWhitespace()
      }
      this._consumeTagOpenEnd()
    } catch (e) {
      if (e instanceof _ControlFlowError) {
        // When the start tag is invalid (including invalid "attributes"), assume we want a "<"
        this._cursor = innerStart
        if (openTagToken) {
          this.tokens.length = tokensBeforeTagOpen
        }
        // Back to back text tokens are merged at the end
        this._beginToken(TokenType.TEXT, start)
        this._endToken(['<'])
        return
      }

      throw e
    }

    const contentTokenType = this._getTagDefinition(tagName).contentType

    if (contentTokenType === TagContentType.RAW_TEXT) {
      this._consumeRawTextWithTagClose(prefix, tagName, false)
    } else if (contentTokenType === TagContentType.ESCAPABLE_RAW_TEXT) {
      this._consumeRawTextWithTagClose(prefix, tagName, true)
    }
  }

  private _consumeRawTextWithTagClose (prefix: string, tagName: string, decodeEntities: boolean) {
    const textToken = this._consumeRawText(decodeEntities, () => {
      if (!this._attemptCharCode(chars.$LT)) return false
      if (!this._attemptCharCode(chars.$SLASH)) return false
      this._consumeTriviaWhitespace()
      if (!this._attemptStrCaseInsensitive(tagName)) return false
      this._consumeTriviaWhitespace()
      return this._attemptCharCode(chars.$GT)
    })
    this._beginToken(TokenType.TAG_CLOSE)
    this._requireCharCodeUntilFn(code => code === chars.$GT, 3)
    this._cursor.advance()  // Consume the `>`
    this._endToken([prefix, tagName])
  }

  private _consumeTagOpenStart (start: CharacterCursor) {
    this._beginToken(TokenType.TAG_OPEN_START, start)
    const parts = this._consumePrefixAndColonAndName()
    return this._endToken(['<', ...parts])
  }

  private _consumeAttributeName () {
    const attrNameStart = this._cursor.peek()
    if (attrNameStart === chars.$SQ || attrNameStart === chars.$DQ) {
      throw this._createError(_unexpectedCharacterErrorMsg(attrNameStart), this._cursor.getSpan())
    }
    this._beginToken(TokenType.ATTR_NAME)
    const parts = this._consumePrefixAndColonAndName()
    this._endToken(parts)
  }

  private _consumeAttributeValue () {
    let value: string
    if (this._cursor.peek() === chars.$SQ || this._cursor.peek() === chars.$DQ) {
      this._beginToken(TokenType.ATTR_QUOTE)
      const quoteChar = this._cursor.peek()
      this._cursor.advance()
      this._endToken([String.fromCodePoint(quoteChar)])
      this._beginToken(TokenType.ATTR_VALUE)
      const parts: string[] = []
      while (this._cursor.peek() !== quoteChar) {
        parts.push(this._readChar(true))
      }
      value = parts.join('')
      this._endToken([this._processCarriageReturns(value)])
      this._beginToken(TokenType.ATTR_QUOTE)
      this._cursor.advance()
      this._endToken([String.fromCodePoint(quoteChar)])
    } else {
      this._beginToken(TokenType.ATTR_VALUE)
      const valueStart = this._cursor.clone()
      this._requireCharCodeUntilFn(isNameEnd, 1)
      value = this._cursor.getChars(valueStart)
      this._endToken([this._processCarriageReturns(value)])
    }
  }

  private _consumeTagOpenEnd () {
    const tokenType = this._attemptCharCode(chars.$SLASH)
      ? TokenType.TAG_OPEN_END_VOID
      : TokenType.TAG_OPEN_END
    this._beginToken(tokenType)
    this._requireCharCode(chars.$GT)
    this._endToken([tokenType == TokenType.TAG_OPEN_END ? '>' : '/>'])
  }

  private _consumeTagClose (start: CharacterCursor) {
    this._beginToken(TokenType.TAG_CLOSE, start)
    this._consumeTriviaWhitespace()
    const parts = this._consumePrefixAndColonAndName()
    this._consumeTriviaWhitespace()
    this._requireCharCode(chars.$GT)
    this._endToken(parts)
  }

  private _consumeExpansionFormStart () {
    this._beginToken(TokenType.EXPANSION_FORM_START)
    this._requireCharCode(chars.$LBRACE)
    this._endToken([])

    this._expansionCaseStack.push(TokenType.EXPANSION_FORM_START)

    this._beginToken(TokenType.RAW_TEXT)
    const condition = this._readUntil(chars.$COMMA)
    this._endToken([condition])
    this._requireCharCode(chars.$COMMA)
    this._consumeTriviaWhitespace()

    this._beginToken(TokenType.RAW_TEXT)
    const type = this._readUntil(chars.$COMMA)
    this._endToken([type])
    this._requireCharCode(chars.$COMMA)
    this._consumeTriviaWhitespace()
  }

  private _consumeExpansionCaseStart () {
    this._beginToken(TokenType.EXPANSION_CASE_VALUE)
    const value = this._readUntil(chars.$LBRACE).trim()
    this._endToken([value])
    this._consumeTriviaWhitespace()

    this._beginToken(TokenType.EXPANSION_CASE_EXP_START)
    this._requireCharCode(chars.$LBRACE)
    this._endToken([])
    this._consumeTriviaWhitespace()

    this._expansionCaseStack.push(TokenType.EXPANSION_CASE_EXP_START)
  }

  private _consumeExpansionCaseEnd () {
    this._beginToken(TokenType.EXPANSION_CASE_EXP_END)
    this._requireCharCode(chars.$RBRACE)
    this._endToken([])
    this._consumeTriviaWhitespace()

    this._expansionCaseStack.pop()
  }

  private _consumeExpansionFormEnd () {
    this._beginToken(TokenType.EXPANSION_FORM_END)
    this._requireCharCode(chars.$RBRACE)
    this._endToken([])

    this._expansionCaseStack.pop()
  }

  private _consumeText () {
    const start = this._cursor.clone()
    this._beginToken(TokenType.TEXT, start)
    const parts: string[] = []

    do {
      if (this._interpolationConfig && this._attemptStr(this._interpolationConfig.start)) {
        parts.push(this._interpolationConfig.start)
        this._inInterpolation = true
      } else if (
        this._interpolationConfig && this._inInterpolation &&
        this._attemptStr(this._interpolationConfig.end)) {
        parts.push(this._interpolationConfig.end)
        this._inInterpolation = false
      } else {
        parts.push(this._readChar(true))
      }
    } while (!this._isTextEnd())

    this._endToken([this._processCarriageReturns(parts.join(''))])
  }

  private _isTextEnd (): boolean {
    if (this._cursor.peek() === chars.$LT || this._cursor.peek() === chars.$EOF) {
      return true
    }

    if (this._tokenizeIcu && !this._inInterpolation) {
      if (this.isExpansionFormStart()) {
        // start of an expansion form
        return true
      }

      if (this._cursor.peek() === chars.$RBRACE && this._isInExpansionCase()) {
        // end of and expansion case
        return true
      }
    }

    return false
  }

  private _readUntil (char: number): string {
    const start = this._cursor.clone()
    this._attemptUntilChar(char)
    return this._cursor.getChars(start)
  }

  private _isInExpansionCase (): boolean {
    return getLastElement(this._expansionCaseStack) === TokenType.EXPANSION_CASE_EXP_START
  }

  private _isInExpansionForm (): boolean {
    if (this._expansionCaseStack.length == 0) return false
    return this._expansionCaseStack.length > 0 &&
      this._expansionCaseStack[this._expansionCaseStack.length - 1] ===
      TokenType.EXPANSION_FORM_START
  }

  private isExpansionFormStart (): boolean {
    if (this._cursor.peek() !== chars.$LBRACE) {
      return false
    }
    if (this._interpolationConfig) {
      const start = this._cursor.clone()
      const isInterpolation = this._attemptStr(this._interpolationConfig.start)
      this._cursor = start
      return !isInterpolation
    }
    return true
  }
}

function isNotWhitespace (code: number): boolean {
  return !chars.isWhitespace(code) || code === chars.$EOF
}

function isNameEnd (code: number): boolean {
  return chars.isWhitespace(code) || code === chars.$GT || code === chars.$SLASH ||
    code === chars.$SQ || code === chars.$DQ || code === chars.$EQ
}

function isPrefixEnd (code: number): boolean {
  return (code < chars.$a || chars.$z < code) && (code < chars.$A || chars.$Z < code) &&
    (code < chars.$0 || code > chars.$9)
}

function isDigitEntityEnd (code: number): boolean {
  return code == chars.$SEMICOLON || code == chars.$EOF || !chars.isAsciiHexDigit(code)
}

function isNamedEntityEnd (code: number): boolean {
  return code == chars.$SEMICOLON || code == chars.$EOF || !chars.isAsciiLetter(code)
}

function isExpansionCaseStart (peek: number): boolean {
  return peek === chars.$EQ || chars.isAsciiLetter(peek) || chars.isDigit(peek)
}

function compareCharCodeCaseInsensitive (code1: number, code2: number): boolean {
  return toUpperCaseCharCode(code1) == toUpperCaseCharCode(code2)
}

function toUpperCaseCharCode (code: number): number {
  return code >= chars.$a && code <= chars.$z ? code - chars.$a + chars.$A : code
}

function mergeTextTokens (srcTokens: Token[]): Token[] {
  const dstTokens: Token[] = []
  let lastDstToken: Token | undefined = undefined
  for (let i = 0; i < srcTokens.length; i++) {
    const token = srcTokens[i]
    if (lastDstToken != null && lastDstToken.type == TokenType.TEXT && token.type == TokenType.TEXT) {
      lastDstToken.parts[0] ! += token.parts[0]
      lastDstToken.locationSpan.setEnd(token.locationSpan.getEnd())
    } else {
      lastDstToken = token
      dstTokens.push(lastDstToken)
    }
  }

  return dstTokens
}


/**
 * The _Tokenizer uses objects of this type to move through the input text,
 * extracting "parsed characters". These could be more than one actual character
 * if the text contains escape sequences.
 */
interface CharacterCursor {
  /** Initialize the cursor. */
  init (): void;

  /** The parsed character at the current cursor position. */
  peek (): number;

  /** Advance the cursor by one parsed character. */
  advance (): void;

  /** Get a span from the marked start point to the current point. */
  getSpan (start?: this, leadingTriviaCodePoints?: number[]): LocationSpan;

  /** Get the parsed characters from the marked start point to the current point. */
  getChars (start: this): string;

  /** The number of characters left before the end of the cursor. */
  charsLeft (): number;

  /** The number of characters between `this` cursor and `other` cursor. */
  diff (other: this): number;

  /** Make a copy of this cursor */
  clone (): CharacterCursor;
}

interface CursorState {
  peek: number;
  offset: number;
  line: number;
  column: number;
}

class PlainCharacterCursor implements CharacterCursor {
  protected state: CursorState
  protected file: LocationFile
  protected input: string
  protected end: number

  constructor (fileOrCursor: PlainCharacterCursor);
  constructor (fileOrCursor: LocationFile, range: LexerRange);
  constructor (fileOrCursor: LocationFile | PlainCharacterCursor, range?: LexerRange) {
    if (fileOrCursor instanceof PlainCharacterCursor) {
      this.file = fileOrCursor.file
      this.input = fileOrCursor.input
      this.end = fileOrCursor.end
      this.state = { ...fileOrCursor.state }
    } else {
      if (!range) {
        throw new Error(
          'Programming error: the range argument must be provided with a file argument.')
      }
      this.file = fileOrCursor
      this.input = fileOrCursor.getContent()
      this.end = range.endPos
      this.state = {
        peek: -1,
        offset: range.startPos,
        line: range.startLine,
        column: range.startCol,
      }
    }
  }

  clone (): PlainCharacterCursor {
    return new PlainCharacterCursor(this)
  }

  peek () {
    return this.state.peek
  }

  charsLeft () {
    return this.end - this.state.offset
  }

  diff (other: this) {
    return this.state.offset - other.state.offset
  }

  advance (): void {
    this.advanceState(this.state)
  }

  init (): void {
    this.updatePeek(this.state)
  }

  getSpan (start?: this, leadingTriviaCodePoints?: number[]): LocationSpan {
    start = start || this
    if (leadingTriviaCodePoints) {
      start = start.clone() as this
      while (this.diff(start) > 0 && leadingTriviaCodePoints.includes(start.peek())) {
        start.advance()
      }
    }

    const startParseLocation = new LocationPointer(start.file, start.state.offset)
    const endParseLocation = new LocationPointer(this.file, this.state.offset)
    return new LocationSpan(startParseLocation, endParseLocation)
  }

  getChars (start: this): string {
    return this.input.substring(start.state.offset, this.state.offset)
  }

  charAt (pos: number): number {
    return this.input.charCodeAt(pos)
  }

  protected advanceState (state: CursorState) {
    if (state.offset >= this.end) {
      this.state = state
      throw new CursorError('Unexpected character "EOF"', this)
    }
    const currentChar = this.charAt(state.offset)
    if (currentChar === chars.$LF) {
      state.line++
      state.column = 0
    } else if (!chars.isNewLine(currentChar)) {
      state.column++
    }
    state.offset++
    this.updatePeek(state)
  }

  protected updatePeek (state: CursorState): void {
    state.peek = state.offset >= this.end ? chars.$EOF : this.charAt(state.offset)
  }
}

class EscapedCharacterCursor extends PlainCharacterCursor {
  protected internalState: CursorState

  constructor (fileOrCursor: EscapedCharacterCursor);
  constructor (fileOrCursor: LocationFile, range: LexerRange);
  constructor (fileOrCursor: LocationFile | EscapedCharacterCursor, range?: LexerRange) {
    if (fileOrCursor instanceof EscapedCharacterCursor) {
      super(fileOrCursor)
      this.internalState = { ...fileOrCursor.internalState }
    } else {
      super(fileOrCursor, range !)
      this.internalState = this.state
    }
  }

  advance (): void {
    this.state = this.internalState
    super.advance()
    this.processEscapeSequence()
  }

  init (): void {
    super.init()
    this.processEscapeSequence()
  }

  clone (): EscapedCharacterCursor {
    return new EscapedCharacterCursor(this)
  }

  getChars (start: this): string {
    const cursor = start.clone()
    let chars = ''
    while (cursor.internalState.offset < this.internalState.offset) {
      chars += String.fromCodePoint(cursor.peek())
      cursor.advance()
    }
    return chars
  }

  /**
   * Process the escape sequence that starts at the current position in the text.
   *
   * This method is called to ensure that `peek` has the unescaped value of escape sequences.
   */
  protected processEscapeSequence (): void {
    const peek = () => this.internalState.peek

    if (peek() === chars.$BACKSLASH) {
      // We have hit an escape sequence so we need the internal state to become independent
      // of the external state.
      this.internalState = { ...this.state }

      // Move past the backslash
      this.advanceState(this.internalState)

      // First check for standard control char sequences
      if (peek() === chars.$n) {
        this.state.peek = chars.$LF
      } else if (peek() === chars.$r) {
        this.state.peek = chars.$CR
      } else if (peek() === chars.$v) {
        this.state.peek = chars.$VTAB
      } else if (peek() === chars.$t) {
        this.state.peek = chars.$TAB
      } else if (peek() === chars.$b) {
        this.state.peek = chars.$BSPACE
      } else if (peek() === chars.$f) {
        this.state.peek = chars.$FF
      }

      // Now consider more complex sequences
      else if (peek() === chars.$u) {
        // Unicode code-point sequence
        this.advanceState(this.internalState)  // advance past the `u` char
        if (peek() === chars.$LBRACE) {
          // Variable length Unicode, e.g. `\x{123}`
          this.advanceState(this.internalState)  // advance past the `{` char
          // Advance past the variable number of hex digits until we hit a `}` char
          const digitStart = this.clone()
          let length = 0
          while (peek() !== chars.$RBRACE) {
            this.advanceState(this.internalState)
            length++
          }
          this.state.peek = this.decodeHexDigits(digitStart, length)
        } else {
          // Fixed length Unicode, e.g. `\u1234`
          const digitStart = this.clone()
          this.advanceState(this.internalState)
          this.advanceState(this.internalState)
          this.advanceState(this.internalState)
          this.state.peek = this.decodeHexDigits(digitStart, 4)
        }
      } else if (peek() === chars.$x) {
        // Hex char code, e.g. `\x2F`
        this.advanceState(this.internalState)  // advance past the `x` char
        const digitStart = this.clone()
        this.advanceState(this.internalState)
        this.state.peek = this.decodeHexDigits(digitStart, 2)
      } else if (chars.isOctalDigit(peek())) {
        // Octal char code, e.g. `\012`,
        let octal = ''
        let length = 0
        let previous = this.clone()
        while (chars.isOctalDigit(peek()) && length < 3) {
          previous = this.clone()
          octal += String.fromCodePoint(peek())
          this.advanceState(this.internalState)
          length++
        }
        this.state.peek = parseInt(octal, 8)
        // Backup one char
        this.internalState = previous.internalState
      } else if (chars.isNewLine(this.internalState.peek)) {
        // Line continuation `\` followed by a new line
        this.advanceState(this.internalState)  // advance over the newline
        this.state = this.internalState
      } else {
        // If none of the `if` blocks were executed then we just have an escaped normal character.
        // In that case we just, effectively, skip the backslash from the character.
        this.state.peek = this.internalState.peek
      }
    }
  }

  protected decodeHexDigits (start: EscapedCharacterCursor, length: number): number {
    const hex = this.input.substr(start.internalState.offset, length)
    const charCode = parseInt(hex, 16)
    if (!isNaN(charCode)) {
      return charCode
    } else {
      start.state = start.internalState
      throw new CursorError('Invalid hexadecimal escape sequence', start)
    }
  }
}

export class CursorError {
  constructor (public msg: string, public cursor: CharacterCursor) {
  }
}
