/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { ParseError } from './parse_util'

import * as html from './ast'
import * as lex from './lexer'
import { Token, TokenizeResult } from './lexer'
import { getNsPrefix, isNgContainer, mergeNsAndName, TagDefinition } from './tags'
import { LocationSpan } from '../../location'

export class TreeError extends ParseError {
  static create (elementName: string | null, span: LocationSpan, msg: string): TreeError {
    return new TreeError(elementName, span, msg)
  }

  constructor (public elementName: string | null, span: LocationSpan, msg: string) {
    super(span, msg)
  }
}

export class ParseTreeResult {
  constructor (public rootNodes: html.Node[], public errors: ParseError[]) {
  }
}

export class Parser {

  constructor (public getTagDefinition: (tagName: string) => TagDefinition) {
  }

  public parse (tokenizeResult: TokenizeResult, url: string, options?: lex.TokenizeOptions): ParseTreeResult {
    const treeAndErrors = new _TreeBuilder(tokenizeResult.tokens, this.getTagDefinition).build()

    return new ParseTreeResult(
      treeAndErrors.rootNodes,
      (<ParseError[]>tokenizeResult.errors).concat(treeAndErrors.errors))
  }

}

class _TreeBuilder {
  private _index: number = -1
  // TODO(issue/24571): remove '!'.
  private _peek !: lex.Token

  private _rootNodes: html.Node[] = []
  private _errors: TreeError[] = []

  private _elementStack: html.Element[] = []

  constructor (
    private tokens: lex.Token[], private getTagDefinition: (tagName: string) => TagDefinition) {
    this._advance()
  }

  build (): ParseTreeResult {
    while (this._peek.type !== lex.TokenType.EOF) {
      if (this._peek.type === lex.TokenType.TAG_OPEN_START) {
        this._consumeStartTag(this._advance())
      } else if (this._peek.type === lex.TokenType.TAG_CLOSE) {
        this._consumeEndTag(this._advance())
      } else if (this._peek.type === lex.TokenType.CDATA_START) {
        this._closeVoidElement()
        this._consumeCdata(this._advance())
      } else if (this._peek.type === lex.TokenType.COMMENT_START) {
        this._closeVoidElement()
        this._consumeComment(this._advance())
      } else if (
        this._peek.type === lex.TokenType.TEXT || this._peek.type === lex.TokenType.RAW_TEXT ||
        this._peek.type === lex.TokenType.ESCAPABLE_RAW_TEXT) {
        this._closeVoidElement()
        this._consumeText(this._advance())
      } else if (this._peek.type === lex.TokenType.EXPANSION_FORM_START) {
        this._consumeExpansion(this._advance())
      } else {
        // Skip all other tokens...
        this._advance()
      }
    }
    return new ParseTreeResult(this._rootNodes, this._errors)
  }

  private _advance (): lex.Token {
    const prev = this._peek
    if (this._index < this.tokens.length - 1) {
      // Note: there is always an EOF token at the end
      this._index++
    }
    this._peek = this.tokens[this._index]
    return prev
  }

  private _advanceIf (type: lex.TokenType): lex.Token | null {
    if (this._peek.type === type) {
      return this._advance()
    }
    return null
  }

  private _consumeCdata (startToken: lex.Token) {
    this._consumeText(this._advance())
    this._advanceIf(lex.TokenType.CDATA_END)
  }

  private _consumeComment (token: lex.Token) {
    const text = this._advanceIf(lex.TokenType.RAW_TEXT)
    this._advanceIf(lex.TokenType.COMMENT_END)
    const value = text != null ? text.parts[0].trim() : null
    this._addToParent(new html.Comment([token], value, token.locationSpan))
  }

  private _consumeExpansion (token: lex.Token) {
    const switchValue = this._advance()

    const type = this._advance()
    const cases: html.ExpansionCase[] = []

    // read =
    while (this._peek.type === lex.TokenType.EXPANSION_CASE_VALUE) {
      const expCase = this._parseExpansionCase()
      if (!expCase) return  // error
      cases.push(expCase)
    }

    // read the final }
    if (this._peek.type !== lex.TokenType.EXPANSION_FORM_END) {
      this._errors.push(
        TreeError.create(null, this._peek.locationSpan, `Invalid ICU message. Missing '}'.`))
      return
    }
    const sourceSpan = new LocationSpan(token.locationSpan.getStart(), this._peek.locationSpan.getEnd())
    const node = new html.Expansion([token], switchValue.parts[0], type.parts[0], cases, sourceSpan, switchValue.locationSpan)
    this._addToParent(node)

    this._advance()
  }

  private _parseExpansionCase (): html.ExpansionCase | null {
    const value = this._advance()

    // read {
    if (this._peek.type !== lex.TokenType.EXPANSION_CASE_EXP_START) {
      this._errors.push(
        TreeError.create(null, this._peek.locationSpan, `Invalid ICU message. Missing '{'.`))
      return null
    }

    // read until }
    const start = this._advance()

    const exp = this._collectExpansionExpTokens(start)
    if (!exp) return null

    const end = this._advance()
    exp.push(new lex.Token(lex.TokenType.EOF, [], end.locationSpan))

    // parse everything in between { and }
    const parsedExp = new _TreeBuilder(exp, this.getTagDefinition).build()
    if (parsedExp.errors.length > 0) {
      this._errors = this._errors.concat(<TreeError[]>parsedExp.errors)
      return null
    }

    const sourceSpan = new LocationSpan(value.locationSpan.getStart(), end.locationSpan.getEnd())
    const expSourceSpan = new LocationSpan(start.locationSpan.getStart(), end.locationSpan.getEnd())
    const node = new html.ExpansionCase([], value.parts[0], parsedExp.rootNodes, sourceSpan, value.locationSpan, expSourceSpan)
    return node
  }

  private _collectExpansionExpTokens (start: lex.Token): lex.Token[] | null {
    const exp: lex.Token[] = []
    const expansionFormStack = [lex.TokenType.EXPANSION_CASE_EXP_START]

    while (true) {
      if (this._peek.type === lex.TokenType.EXPANSION_FORM_START ||
        this._peek.type === lex.TokenType.EXPANSION_CASE_EXP_START) {
        expansionFormStack.push(this._peek.type)
      }

      if (this._peek.type === lex.TokenType.EXPANSION_CASE_EXP_END) {
        if (lastOnStack(expansionFormStack, lex.TokenType.EXPANSION_CASE_EXP_START)) {
          expansionFormStack.pop()
          if (expansionFormStack.length == 0) return exp

        } else {
          this._errors.push(
            TreeError.create(null, start.locationSpan, `Invalid ICU message. Missing '}'.`))
          return null
        }
      }

      if (this._peek.type === lex.TokenType.EXPANSION_FORM_END) {
        if (lastOnStack(expansionFormStack, lex.TokenType.EXPANSION_FORM_START)) {
          expansionFormStack.pop()
        } else {
          this._errors.push(
            TreeError.create(null, start.locationSpan, `Invalid ICU message. Missing '}'.`))
          return null
        }
      }

      if (this._peek.type === lex.TokenType.EOF) {
        this._errors.push(
          TreeError.create(null, start.locationSpan, `Invalid ICU message. Missing '}'.`))
        return null
      }

      exp.push(this._advance())
    }
  }

  private _consumeText (token: lex.Token) {
    let text = token.parts[0]
    if (text.length > 0 && text[0] == '\n') {
      const parent = this._getParentElement()
      if (parent != null && parent.children.length == 0 &&
        this.getTagDefinition(parent.name).ignoreFirstLf) {
        text = text.substring(1)
      }
    }

    if (text.length > 0) {
      const node = new html.Text([token], text, token.locationSpan)
      this._addToParent(node)
    }
  }

  private _closeVoidElement (): void {
    const el = this._getParentElement()
    if (el && this.getTagDefinition(el.name).isVoid) {
      this._elementStack.pop()
    }
  }

  private _consumeStartTag (startTagToken: lex.Token) {
    const tokens: lex.Token[] = [startTagToken]
    const prefix = startTagToken.parts[1]
    const name = startTagToken.parts[3]
    const attrs: html.Attribute[] = []
    while (true) {
      if (this._peek.type === lex.TokenType.ATTR_NAME) {
        const attribute = this._consumeAttr(this._advance())
        attrs.push(attribute)
        continue
      }
      if (this._peek.type === lex.TokenType.TRIVIA) {
        this._advance()
        continue
      }
      break
    }
    const fullName = this._getElementFullName(prefix, name, this._getParentElement())
    let selfClosing = false
    let closingTagToken: Token | undefined
    // Note: There could have been a tokenizer error
    // so that we don't get a token for the end tag...
    if (this._peek.type === lex.TokenType.TAG_OPEN_END_VOID) {
      this._advance()
      selfClosing = true
      const tagDef = this.getTagDefinition(fullName)
      if (!(tagDef.canSelfClose || getNsPrefix(fullName) !== null || tagDef.isVoid)) {
        const errorMessage = `Only void and foreign elements can be self closed "${startTagToken.parts[1]}"`
        this._errors.push(TreeError.create(fullName, startTagToken.locationSpan, errorMessage))
      }
    } else if (this._peek.type === lex.TokenType.TAG_OPEN_END) {
      closingTagToken = this._advance()
      tokens.push(closingTagToken)
      selfClosing = false
    }
    const end = this._peek.locationSpan.getStart()
    const span = new LocationSpan(startTagToken.locationSpan.getStart(), end)
    const el = new html.Element(tokens, fullName, attrs, [], span, span, undefined)
    this._pushElement(el)
    if (selfClosing) {
      this._popElement(fullName)
      el.endSourceSpan = span
    }
  }

  private _pushElement (el: html.Element) {
    const parentEl = this._getParentElement()

    if (parentEl && this.getTagDefinition(parentEl.name).isClosedByChild(el.name)) {
      this._elementStack.pop()
    }

    this._addToParent(el)
    this._elementStack.push(el)
  }

  private _consumeEndTag (endTagToken: lex.Token) {
    const prefix = endTagToken.parts[0]
    const localName = endTagToken.parts[2]
    const fullName = this._getElementFullName(prefix, localName, this._getParentElement())

    const parentElement = this._getParentElement()
    if (parentElement != null) {
      parentElement.endSourceSpan = endTagToken.locationSpan
      const start = parentElement.startSourceSpan!.getStart()
      const end = endTagToken.locationSpan.getEnd()
      parentElement.locationSpan = new LocationSpan(start, end)
      parentElement.tokens.push(endTagToken)
    }

    if (this.getTagDefinition(fullName).isVoid) {
      const msg = `Void elements do not have end tags "${localName}"`
      const error = TreeError.create(fullName, endTagToken.locationSpan, msg)
      this._errors.push(error)
    } else if (!this._popElement(fullName)) {
      const link = `https://www.w3.org/TR/html5/syntax.html#closing-elements-that-have-implied-end-tags`
      const errMsg = [
        `Unexpected closing tag "${fullName}". `,
        `It may happen when the tag has already been closed by another tag. `,
        `For more info see ${link}.`,
      ].join('')
      const error = TreeError.create(fullName, endTagToken.locationSpan, errMsg)
      this._errors.push(error)
    }
  }

  private _popElement (fullName: string): boolean {
    for (let stackIndex = this._elementStack.length - 1; stackIndex >= 0; stackIndex--) {
      const el = this._elementStack[stackIndex]
      if (el.name == fullName) {
        this._elementStack.splice(stackIndex, this._elementStack.length - stackIndex)
        return true
      }

      if (!this.getTagDefinition(el.name).closedByParent) {
        return false
      }
    }
    return false
  }

  private _consumeAttr (attrNameToken: lex.Token): html.Attribute {
    const tokens: Token[] = [attrNameToken]
    const fullName = mergeNsAndName(attrNameToken.parts[0], attrNameToken.parts[2])
    let end = attrNameToken.locationSpan.getEnd()
    let value = ''
    let valueSpan: LocationSpan = undefined!
    if (this._peek.type == lex.TokenType.ATTR_EQUAL) {
      const eqToken = this._advance()
      tokens.push(eqToken)
    }
    if (this._peek.type === lex.TokenType.ATTR_QUOTE) {
      const quoteToken = this._advance()
      tokens.push(quoteToken)
    }
    if (this._peek.type === lex.TokenType.ATTR_VALUE) {
      const valueToken = this._advance()
      tokens.push(valueToken)
      value = valueToken.parts[0]
      end = valueToken.locationSpan.getEnd()
      valueSpan = valueToken.locationSpan
    }
    if (this._peek.type === lex.TokenType.ATTR_QUOTE) {
      const quoteToken = this._advance()
      tokens.push(quoteToken)
      end = quoteToken.locationSpan.getEnd()
    }

    const sourceSpan = new LocationSpan(attrNameToken.locationSpan.getStart(), end)
    const node = new html.Attribute(tokens, fullName, value, sourceSpan, valueSpan)
    return node
  }

  private _getParentElement (): html.Element | null {
    return this._elementStack.length > 0 ? this._elementStack[this._elementStack.length - 1] : null
  }

  /**
   * Returns the parent in the DOM and the container.
   *
   * `<ng-container>` elements are skipped as they are not rendered as DOM element.
   */
  private _getParentElementSkippingContainers ():
    { parent: html.Element | null, container: html.Element | null } {
    let container: html.Element | null = null

    for (let i = this._elementStack.length - 1; i >= 0; i--) {
      if (!isNgContainer(this._elementStack[i].name)) {
        return { parent: this._elementStack[i], container }
      }
      container = this._elementStack[i]
    }

    return { parent: null, container }
  }

  private _addToParent (node: html.Node) {
    const parent = this._getParentElement()
    if (parent != null) {
      parent.children.push(node)
    } else {
      this._rootNodes.push(node)
    }
  }

  /**
   * Insert a node between the parent and the container.
   * When no container is given, the node is appended as a child of the parent.
   * Also updates the element stack accordingly.
   *
   * @internal
   */
  private _insertBeforeContainer (
    parent: html.Element, container: html.Element | null, node: html.Element) {
    if (!container) {
      this._addToParent(node)
      this._elementStack.push(node)
    } else {
      if (parent) {
        // replace the container with the new node in the children
        const index = parent.children.indexOf(container)
        parent.children[index] = node
      } else {
        this._rootNodes.push(node)
      }
      node.children.push(container)
      this._elementStack.splice(this._elementStack.indexOf(container), 0, node)
    }
  }

  private _getElementFullName (prefix: string, localName: string, parentElement: html.Element | null):
    string {
    if (prefix === '') {
      prefix = this.getTagDefinition(localName).implicitNamespacePrefix || ''
      if (prefix === '' && parentElement != null) {
        prefix = getNsPrefix(parentElement.name)
      }
    }

    return mergeNsAndName(prefix, localName)
  }
}

function lastOnStack (stack: any[], element: any): boolean {
  return stack.length > 0 && stack[stack.length - 1] === element
}
