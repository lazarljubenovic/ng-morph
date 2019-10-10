import { NgAstNode } from '../ng-ast-node'
import { Project } from '../../../project'
import { LocationSpan } from '../location'
import { Template } from './template'
import {
  isBananaInTheBox,
  isBoundAttribute,
  isBoundEvent,
  isReference,
  isTextAttribute,
} from './template-nodes-type-guards'
import {
  concatErrors,
  getFirstElementOrThrow,
  getLastElementOrThrow,
  Predicate,
  TapFn,
  throwIfUndefined,
} from '../../../utils'
import { getTokenTypeName, isTokenOfType, Token, TokenType } from './tokenizer/lexer'
import * as tg from 'type-guards'

export interface TextReplaceConfig {
  token: Token
  newText: string
}

export interface NewTokenConfig {
  type: TokenType
  text: string
}

export abstract class TemplateNode extends NgAstNode {

  private parentTemplateNode?: TemplateNode
  private readonly template: Template
  private readonly tokens: Token[]

  protected constructor (
    project: Project,
    locationSpan: LocationSpan,
    tokens: Token[],
    template: Template,
  ) {
    super(project, locationSpan)
    this.tokens = tokens
    this.template = template
  }

  public abstract getTemplateChildren (): TemplateNode[]

  public setTemplateParent (templateParent: TemplateNode): void {
    this.parentTemplateNode = templateParent
  }

  public getTemplateParent (): TemplateNode | undefined {
    return this.parentTemplateNode
  }

  public getTemplate (): Template {
    return this.template
  }

  public getNextTemplateSibling (): TemplateNode | undefined {
    const parent = this.getTemplateParent()
    if (parent != null) {
      const children = parent.getTemplateChildren()
      const index = children.findIndex(child => child == this)
      if (index == -1) throw new Error(`Expected to have found self in parent's children.`)
      const nextIndex = index + 1
      return children[nextIndex]
    } else {
      const parent = this.getTemplate()
      const children = parent.getRoots()
      const index = children.findIndex(child => child == this as any)
      if (index == -1) throw new Error(`Expected to have found self (root) in template's roots.`)
      const nextIndex = index + 1
      return children[nextIndex]
    }
  }

  public getNextTemplateSiblingOrThrow (): TemplateNode {
    return throwIfUndefined(this.getNextTemplateSibling(), `Expected to have found the next sibling.`)
  }

  public getDescendants<T extends TemplateNode> (guard: (tNode: TemplateNode) => tNode is T): T[]
  public getDescendants (predicate: Predicate<TemplateNode>): TemplateNode[]
  public getDescendants (): TemplateNode[]
  public getDescendants (predicate?: Predicate<TemplateNode>): TemplateNode[] {
    const result: TemplateNode[] = []
    const queue: TemplateNode[] = [...this.getTemplateChildren()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getTemplateChildren())
      if (predicate != null && predicate(node)) {
        result.push(node)
      }
    }
    return result
  }

  public getDescendant<T extends TemplateNode> (guard: (tNode: TemplateNode) => tNode is T): T | undefined
  public getDescendant (predicate: Predicate<TemplateNode> | undefined): TemplateNode | undefined
  public getDescendant (): TemplateNode | undefined
  public getDescendant (predicate?: Predicate<TemplateNode>): TemplateNode | undefined {
    const queue: TemplateNode[] = [...this.getTemplateChildren()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getTemplateChildren())
      if (predicate != null && predicate(node)) {
        return node
      }
    }
    return undefined
  }

  public getDescendantOrThrow<T extends TemplateNode> (guard: (tNode: TemplateNode) => tNode is T): T
  public getDescendantOrThrow (predicate?: Predicate<TemplateNode> | undefined): TemplateNode
  public getDescendantOrThrow (): TemplateNode
  public getDescendantOrThrow (predicate?: Predicate<TemplateNode>): TemplateNode {
    return throwIfUndefined(this.getDescendant(predicate), `Expected to find a descendant of kind.`)
  }

  protected _replaceTextByTokens (textReplaceConfigs: Iterable<TextReplaceConfig>) {
    for (const { token, newText } of textReplaceConfigs) {
      const diff = newText.length - token.locationSpan.getLength()
      token.locationSpan.replaceText(newText)
      this.getTemplate()._forEachTokenAfter(token, token => {
        token.locationSpan.moveBy(diff)
      }, { inclusive: false })
    }
  }

  protected _addTokensAfter (token: Token, ...newTokenConfigs: NewTokenConfig[]): void {
    if (newTokenConfigs.length == 0) return

    const tokenIndex = this.tokens.indexOf(token)
    if (tokenIndex == -1) {
      const tokensArray = this.tokens.map(token => token.printForDebug()).join(', ')
      const error = [
        `Cannot add tokens after ${token.printForDebug()}, `,
        `because it was not found in the array ${tokensArray}.`,
      ].join('')
      throw new Error(error)
    }

    // Create tokens and compute their positions based on text lengths
    let currentPosition = token.locationSpan.getEnd().getOffset()
    const newTokens = newTokenConfigs.map(({ type, text }) => {
      const length = text.length
      const locationSpan = token.locationSpan.clone()
      locationSpan.setStartOffset(currentPosition)
      currentPosition += length
      locationSpan.setEndOffset(currentPosition)
      return new Token(type, [text], locationSpan)
    })

    // Change the local tokens.
    this.tokens.splice(tokenIndex + 1, 0, ...newTokens)

    // Change tokens saved for the whole template.
    const newText = newTokenConfigs.map(({ text }) => text).join('')
    this.getTemplate()._addTokensAfter(token, newText, ...newTokens)
  }

  protected _deleteTokensInRow (tokenOrIndex: Token | number, deleteCount: number, { inclusive = false } = {}): void {
    const index = typeof tokenOrIndex == 'number' ? tokenOrIndex : this.tokens.indexOf(tokenOrIndex)
    const token = typeof tokenOrIndex == 'number' ? this.tokens[index] : tokenOrIndex

    if (index == -1) {
      const tokensArray = this.tokens.map(token => token.printForDebug()).join(', ')
      const error = [
        `Cannot delete tokens after ${token.printForDebug()}, `,
        `because it was not found in the array ${tokensArray}.`,
      ].join('')
      throw new Error(error)
    }

    // Delete the local tokens.
    // They will be marked as forgotten below.
    this.tokens.splice(index + (inclusive ? 0 : 1), deleteCount)

    // Delete tokens saved for the whole template.
    this.getTemplate()._deleteTokens(token, { deleteCount, inclusive })
  }

  protected _deleteToken (tokenOrIndex: Token | number): void {
    this._deleteTokensInRow(tokenOrIndex, 1, { inclusive: true })
  }

  protected _deleteTokens (tokensOrIndexes: Array<Token | number>): void {
    tokensOrIndexes.forEach(tokenOrIndex => {
      this._deleteToken(tokenOrIndex)
    })
  }

  protected getTokens<T extends TokenType> (type: T): Token<T>[]
  protected getTokens<T extends Token> (guard: (token: Token) => token is T): T[]
  protected getTokens (predicate: Predicate<Token>): Token[]
  protected getTokens (): Token[]
  protected getTokens (predicateOrTokenType?: Predicate<Token> | TokenType): Token[] {
    if (predicateOrTokenType == null) {
      return this.tokens
    } else {
      const fn = typeof predicateOrTokenType == 'function'
        ? predicateOrTokenType
        : isTokenOfType(predicateOrTokenType)
      return this.tokens.filter(fn)
    }
  }

  protected getFirstTokenOfType<Type extends TokenType> (type: Type): Token<Type> | undefined {
    return this.tokens.find(token => token.type == type)
  }

  protected getFirstTokenOfTypeOrThrow<Type extends TokenType> (type: Type): Token<Type> {
    const result = this.getFirstTokenOfType(type)
    return throwIfUndefined(result, [
      `Expected to find ${getTokenTypeName(type)} `,
      `among tokens for ${this.constructor.name}: `,
      `${this.tokens.map(token => token.typeName).join(', ') || `(tokens array is empty)`}.`,
    ].join(''))
  }

  protected getFirstTokenIndex (): number {
    const firstToken = getFirstElementOrThrow(this.tokens, `The tokens array is empty.`)
    const template = this.getTemplate()
    return template.getTokenIndex(firstToken)
  }

  protected forEachTokenAfterHere (fn: TapFn<Token>) {
    const lastToken = getLastElementOrThrow(this.tokens, `The tokens array is empty.`)
    const template = this.getTemplate()
    template._forEachTokenAfter(lastToken, fn, { inclusive: false })
  }

  protected forEachTokenHere (fn: TapFn<Token>) {
    const firstToken = getFirstElementOrThrow(this.tokens, `The tokens array is empty.`)
    const lastToken = getLastElementOrThrow(this.tokens, `The tokens array is empty.`)
    const template = this.getTemplate()
    template._forEachTokenBetween(firstToken, lastToken, fn, { inclusiveStart: true, inclusiveEnd: true })
  }

  protected forEachTokenHereAndAfterHere (fn: TapFn<Token>) {
    this.forEachTokenHere(fn)
    this.forEachTokenAfterHere(fn)
  }

}


// region Text and interpolation

export class TextTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template,
                      protected text: string) {
    super(project, locationSpan, tokens, template)
  }

  public getText (): string {
    return this.text
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class InterpolationTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template,
                      protected text: string) {
    super(project, locationSpan, tokens, template)
  }

  public getTextToken () {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TEXT)
  }

  public getText (): string {
    return this.getTextToken().toString()
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

  public changeText (newText: string): this {
    this._replaceTextByTokens([
      { token: this.getTextToken(), newText },
    ])
    return this
  }

  public trimText (): this {
    const trimmedText = this.getText().trim()
    return this.changeText(trimmedText)
  }


}

// endregion Text and interpolation

// region Elements, ng-template and ng-container

type AnyAttribute =
  TextAttributeTemplateNode
  | BoundAttributeTemplateNode
  | BoundEventTemplateNode
  | BananaInTheBoxTemplateNode
  | ReferenceTemplateNode

export abstract class ElementLikeTemplateNode extends TemplateNode {

  protected textAttributes: TextAttributeTemplateNode[] = []
  protected boundAttributes: BoundAttributeTemplateNode[] = []
  protected boundEvents: BoundEventTemplateNode[] = []
  protected bananaInTheBoxes: BananaInTheBoxTemplateNode[] = []
  protected references: ReferenceTemplateNode[] = []

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template,
                      protected allAttributes: Array<AnyAttribute>,
                      protected children: TemplateNode[]) {
    super(project, locationSpan, tokens, template)

    for (const attribute of allAttributes) {
      if (isTextAttribute(attribute)) this.textAttributes.push(attribute)
      else if (isBoundAttribute(attribute)) this.boundAttributes.push(attribute)
      else if (isBoundEvent(attribute)) this.boundEvents.push(attribute)
      else if (isBananaInTheBox(attribute)) this.bananaInTheBoxes.push(attribute)
      else if (isReference(attribute)) this.references.push(attribute)
      else throw new Error(`Unexpected type of attribute ${(attribute as any).constructor.name}.`)
    }
  }

  public getTemplateChildren (): TemplateNode[] {
    return this.children
  }

  public abstract getTagName (): string

  public getTagOpenStartToken (): Token<TokenType.TAG_OPEN_START> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TAG_OPEN_START)
  }

  public getTagEndToken (): Token<TokenType.TAG_CLOSE> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TAG_CLOSE)
  }

  public getStartTagNameLocationSpan (): LocationSpan {
    const token = this.getTagOpenStartToken()
    return token.locationSpan.clone().moveStartBy(1) // leading "<"
  }

  public getEndTagNameLocationSpan (): LocationSpan {
    const token = this.getTagEndToken()
    return token.locationSpan.clone().moveEndBy(-1) // trailing ">"
  }

  public getAttributes<T extends AttributeTemplateNode> (guard: (attr: AttributeTemplateNode) => attr is T): T[]
  public getAttributes (predicate?: Predicate<AttributeTemplateNode> | undefined): AttributeTemplateNode[]
  public getAttributes (predicate?: Predicate<AttributeTemplateNode>): AttributeTemplateNode[] {
    return predicate == null
      ? this.allAttributes
      : this.allAttributes.filter(predicate)
  }

  public getFirstAttribute<T extends AttributeTemplateNode> (guard: (attr: AttributeTemplateNode) => attr is T): T | undefined
  public getFirstAttribute (predicate?: Predicate<AttributeTemplateNode> | undefined): AttributeTemplateNode | undefined
  public getFirstAttribute (predicate?: Predicate<AttributeTemplateNode>): AttributeTemplateNode | undefined {
    return predicate == null
      ? this.allAttributes[0]
      : this.allAttributes.find(predicate)
  }

  public getFirstAttributeOrThrow<T extends AttributeTemplateNode> (guard: (attr: AttributeTemplateNode) => attr is T): T
  public getFirstAttributeOrThrow (predicate?: Predicate<AttributeTemplateNode> | undefined): AttributeTemplateNode
  public getFirstAttributeOrThrow (predicate?: Predicate<AttributeTemplateNode>): AttributeTemplateNode {
    return throwIfUndefined(this.getFirstAttribute(predicate), `Expected to find an attribute.`)
  }

  public getReferenceNamed (referenceName: string): ReferenceTemplateNode | undefined {
    return this.references.find(reference => reference.getAttributeNameString() == referenceName)
  }

  public getReferenceNamedOrThrow (referenceName: string): ReferenceTemplateNode {
    const position = this.getLocationSpan().printLong()
    const knownReferences = this.getAttributes(isReference).map(ref => ref.getAttributeNameString()).join(', ') || '(none)'
    const error = [
      `Expected element-like node at ${position} to have a reference named "${referenceName}". `,
      `These references were found: ${knownReferences}.`,
    ].join('')
    return throwIfUndefined(this.getReferenceNamed(referenceName), error)
  }

  public hasReferenceNamed (referenceName: string): boolean {
    return this.getReferenceNamed(referenceName) != null
  }

}

export class ElementTemplateNode extends ElementLikeTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template,
                      protected tagName: string,
                      allAttributes: Array<AnyAttribute>,
                      children: TemplateNode[]) {
    super(project, locationSpan, tokens, template, allAttributes, children)
  }

  public getTagName (): string {
    return this.getStartTagNameLocationSpan().getText()
  }

  public hasTagName (tagName: string): boolean {
    return this.getTagName() == tagName
  }

  public changeTagName (newTagName: string): this {
    this._replaceTextByTokens([
      { token: this.getTagOpenStartToken(), newText: '<' + newTagName },
      { token: this.getTagEndToken(), newText: '</' + newTagName + '>' },
    ])
    return this
  }

}

export class NgTemplateTemplateNode extends ElementLikeTemplateNode {

  public getTagName (): string {
    return `ng-template`
  }

}

export class NgContainerTemplateNode extends ElementLikeTemplateNode {

  public getTagName (): string {
    return `ng-container`
  }

}

export type RootLevelTemplateNode =
  TextTemplateNode |
  InterpolationTemplateNode |
  ElementTemplateNode |
  NgTemplateTemplateNode |
  NgContainerTemplateNode |
  CommentTemplateNode

// endregion Elements, ng-template and ng-container

// region Attributes (text attributes, inputs, outputs)

export abstract class AttributeTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template) {
    super(project, locationSpan, tokens, template)
  }

  protected getNameToken (): Token<TokenType.ATTR_NAME> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.ATTR_NAME)
  }

  protected getValueToken (): Token<TokenType.ATTR_VALUE> | undefined {
    return this.getFirstTokenOfType(TokenType.ATTR_VALUE)
  }

  protected getQuoteTokens (): Token<TokenType.ATTR_QUOTE>[] {
    return this.getTokens(TokenType.ATTR_QUOTE)
  }

  public getAttributeNameString (): string {
    return this.getNameToken().toString()
  }

  public hasValue (): boolean {
    return this.getValueToken() != null
  }

  public getAttributeValueString (): string | undefined {
    const valueToken = this.getValueToken()
    if (valueToken == null) return undefined
    return valueToken.toString()
  }

  public getAttributeValueStringOrThrow (customErrMsg?: string): string {
    const name = this.getAttributeNameString()
    const forDebug = this.getNameToken().printForDebug()
    const mainErrMsg = `Expected attribute ${name} (${forDebug}) to have value.`
    const valueString = this.getAttributeValueString()
    return throwIfUndefined(valueString, concatErrors(mainErrMsg, customErrMsg))
  }

  public changeAttributeName (newName: string): this {
    this._replaceTextByTokens([
      { token: this.getNameToken(), newText: newName },
    ])
    return this
  }

  public addAttributeValueOrThrowIfAlreadyExists (newValue: string, customErrMsg?: string): this {
    const valueToken = this.getValueToken()
    if (valueToken != null) {
      const mainErrMsg = `Expected no value for attribute "${this.getAttributeNameString()}", `
        + `but it already exists: ${valueToken.printForDebug()}.`
      throw new Error(concatErrors(mainErrMsg, customErrMsg))
    }

    const newTokenConfig: NewTokenConfig[] = [
      { type: TokenType.ATTR_EQUAL, text: '=' },
      { type: TokenType.ATTR_QUOTE, text: '"' },
      { type: TokenType.ATTR_VALUE, text: newValue },
      { type: TokenType.ATTR_QUOTE, text: '"' },
    ]
    this._addTokensAfter(this.getNameToken(), ...newTokenConfig)

    return this
  }

  public changeAttributeValue (newValue: string): this {
    const valueToken = this.getValueToken()
    if (valueToken == null) return this.addAttributeValueOrThrowIfAlreadyExists(newValue)
    this._replaceTextByTokens([
      { token: valueToken, newText: newValue },
    ])
    return this
  }

  public addValueOrOverwriteExisting (newValue: string): this {
    if (this.hasValue()) {
      this.changeAttributeValue(newValue)
    } else {
      this.addAttributeValueOrThrowIfAlreadyExists(newValue, `This is a programming error and is likely a bug in ng-morph.`)
    }
    return this
  }

  /**
   * Completely remove the value of the attribute, transforming `name="key"` to `name`.
   * If the value doesn't exist, don't do anything.
   */
  public deleteValueOrIgnore (): this {
    if (!this.hasValue()) return this
    return this.deleteValueOrThrow()
  }

  /**
   * Completely remove the value of the attribute, transforming `name="key"` to `name`.
   * If the value doesn't exist, throw.
   */
  public deleteValueOrThrow (): this {
    if (!this.hasValue()) {
      throw new Error(`Expected attribute's value to not exist.`)
    }

    const tokens: Token[] = [
      this.getValueToken(),
      ...this.getQuoteTokens(),
    ].filter(tg.isNotNullish)

    this._deleteTokens(tokens)

    return this
  }

  public hasQuotes (): boolean {
    const quoteTokens = this.getQuoteTokens()
    if (quoteTokens.length == 2) return true
    if (quoteTokens.length == 0) return true
    throw new Error(`Expected exactly two or exactly zero quote tokens in ${this}.`)
  }

  /**
   * Adds quotes around the value of the attribute, under the assumption that attribute has a value defined and
   * that it's unquoted.
   *
   * @param quote - The type of quotes to use, single or double, as literal strings. Double quote by default.
   * @param customErrMsg - Additional message to display in case of invalid operation (see "throws" section).
   *
   * @throws - When quotes already exist around the value, or when there's no value to wrap in quotes.
   *
   */
  public addQuotesOrThrow (quote: '\'' | '"' = '"', customErrMsg?: string): this {
    if (this.hasQuotes()) {
      const mainErrMsg = `Tried to add quotes in the attribute ${this}, but it already has quotes.`
      throw new Error(concatErrors(mainErrMsg, customErrMsg))
    }

    if (!this.hasValue()) {
      const mainErrMsg = `Tried to add quotes in the attribute ${this}, but it has no value.`
      throw new Error(concatErrors(mainErrMsg, customErrMsg))
    }

    const nameToken = this.getNameToken()
    this._addTokensAfter(nameToken, { text: quote, type: TokenType.ATTR_QUOTE })

    const valueToken = this.getValueToken()! // Tested for value above.
    this._addTokensAfter(valueToken, { text: quote, type: TokenType.ATTR_QUOTE })

    return this
  }

}

export class TextAttributeTemplateNode extends AttributeTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template) {
    super(project, locationSpan, tokens, template)
  }

  public getName (): string {
    return this.getAttributeNameString()
  }

  public getValue (): string | undefined {
    return this.getAttributeValueString()
  }

  public getValueOrThrow (customErrMsg?: string): string {
    return this.getAttributeValueStringOrThrow(customErrMsg)
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class BoundAttributeTemplateNode extends AttributeTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template) {
    super(project, locationSpan, tokens, template)
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class BoundEventTemplateNode extends AttributeTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template) {
    super(project, locationSpan, tokens, template)
  }

  public getHandler (): string | undefined {
    return this.getAttributeValueString()
  }

  public getHandlerOrThrow (customErrMsg?: string): string {
    return this.getAttributeValueStringOrThrow(customErrMsg)
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class BananaInTheBoxTemplateNode extends AttributeTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template) {
    super(project, locationSpan, tokens, template)
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class ReferenceTemplateNode extends AttributeTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template) {
    super(project, locationSpan, tokens, template)
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

// endregion Attributes (text attributes, inputs, outputs)

export class CommentTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template,
                      protected value: string | null) {
    super(project, locationSpan, tokens, template)
  }

  public getValue (): string | null {
    return this.value
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export abstract class BindingTargetTemplateNode extends TemplateNode {
}

export class PropertyBindingTargetTemplateNode extends BindingTargetTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template,
                      protected text: string,
                      protected name: string) {
    super(project, locationSpan, tokens, template)
  }

  public getText (): string {
    return this.text
  }

  public getName (): string {
    return this.name
  }

  // public isBare (): boolean {
  //
  // }
  //
  // public isWithBrackets (): boolean {
  //
  // }
  //
  // public isWithBindPrefix (): boolean {
  //
  // }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class EventBindingTargetTemplateNode extends BindingTargetTemplateNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      tokens: Token[],
                      template: Template,
                      protected text: string,
                      protected name: string) {
    super(project, locationSpan, tokens, template)
  }

  public getText (): string {
    return this.text
  }

  public getName (): string {
    return this.name
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class ExpressionTemplateNode extends TemplateNode {

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class StatementTemplateNode extends TemplateNode {

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}
