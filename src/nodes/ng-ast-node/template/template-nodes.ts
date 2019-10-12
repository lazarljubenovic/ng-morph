import { NgAstNode } from '../ng-ast-node'
import { Project } from '../../../project'
import { LocationSpan } from '../location'
import { Template } from './template'
import {
  concatErrors,
  getFirstElement,
  getFirstElementOrThrow,
  getLastElement,
  getLastElementOrThrow,
  Predicate,
  TapFn,
  throwIfUndefined,
} from '../../../utils'
import { getTokenTypeName, Token, TokenType } from './tokenizer/lexer'
import { InsertionRule, lastChild } from './template-node-insertion-rules'
import {
  createNode, isElementLikeStructure,
  TemplateNodeTypeToTemplateNodeMap,
  TemplateNodeTypeToTemplateNodeStructureMap,
  TemplateNodeTypeWithoutRoot,
} from './template-nodes-structs'

/**
 * @fileOverview
 */

function tokesToReactiveLocationSpan (tokens: Token[]): LocationSpan {
  const spans = tokens.map(token => token.locationSpan)
  return LocationSpan.ReactiveFromSeveralOrdered(...spans)
}

export interface TextReplaceConfig {
  token: Token
  newText: string
}

export interface NewTokenConfig {
  type: TokenType
  text: string
}

export interface TemplateNodeConstructor<T extends TemplateNode> {
  new (project: Project, tokens: Token[], template: Template): T
}

export abstract class TemplateNode extends NgAstNode {

  private parentTemplateNode?: TemplateNode
  private readonly template: Template
  private readonly tokens: Token[]
  private _isForgotten: boolean = false

  public constructor (
    project: Project,
    tokens: Token[],
    template: Template,
  ) {
    super(project, tokesToReactiveLocationSpan(tokens))
    this.tokens = tokens
    this.template = template
  }

  public isForgotten (): boolean {
    return this._isForgotten
  }

  public forget (): void {
    this._isForgotten = true
  }

  /**
   * Throw if the node is forgotten.
   *
   * @param errorMessage - Optional additional error message.
   */
  public assertNotForgotten (errorMessage?: string): void {
    if (this.isForgotten()) {
      const text = this.tokens.map(x => x.toString()).join('')
      const mainErrorMessage = `Expected the template node "${text}" not to have been forgotten.`
      const error = concatErrors(mainErrorMessage, errorMessage)
      throw new Error(error)
    }
  }

  public abstract getChildren (): TemplateNode[]

  /**
   * Set the parent node of this node.
   * By default, throws if the parent is already set.
   *
   * This is a low-level method and it doesn't check or change the parent's `children` property.
   * Consider using {@link addChildrenAtIndex} on the parent instead.
   *
   * @param parent - The node that will become the parent node.
   * @param allowOverwriting - In case parent is already set, should the method throw.
   *
   * @throws Error - Unless `allowOverwriting` flag is set, throw if the parent is already defined.
   */
  public setParent (parent: TemplateNode, { allowOverwriting = false } = {}): void {
    if (!allowOverwriting && this.parentTemplateNode != null) {
      throw new Error(`Cannot set template parent because it has already been set. ` +
        `Use "allowOverwriting" option if you want this behavior.`)
    }
    this.parentTemplateNode = parent
  }

  /**
   * Detach this node from the parent.
   *
   * This is a low-level method and it doesn't check or change the parent's `children` property.
   */
  public unsetParent (): void {
    this.parentTemplateNode = undefined
  }

  public setOrUnsetParent (parent: TemplateNode | undefined): void {
    this.parentTemplateNode = parent
  }

  public getParent (): TemplateNode | undefined {
    return this.parentTemplateNode
  }

  public getParentOrThrow (errorMessage?: string): TemplateNode {
    return throwIfUndefined(this.getParent(), errorMessage)
  }

  public getIndexInParentsChildren (): number {
    const parent = this.getParentOrThrow(`Expected parent not to be null.`)
    let index: number
    const siblings = parent.getChildren()
    index = siblings.indexOf(this as any)
    if (index == -1) {
      throw new Error(`Node not found in parent's children. This could be a bug in ng-morph.`)
    }
    return index
  }

  public getTemplate (): Template {
    return this.template
  }

  public getNextTemplateSibling (): TemplateNode | undefined {
    const parent = this.getParentOrThrow()
    const children = parent.getChildren()
    const index = children.findIndex(child => child == this)
    if (index == -1) throw new Error(`Expected to have found self in parent's children.`)
    const nextIndex = index + 1
    return children[nextIndex]
  }

  public getNextTemplateSiblingOrThrow (): TemplateNode {
    return throwIfUndefined(this.getNextTemplateSibling(), `Expected to have found the next sibling.`)
  }

  public getDescendants<T extends TemplateNode> (guard: (tNode: TemplateNode) => tNode is T): T[]
  public getDescendants (predicate: Predicate<TemplateNode>): TemplateNode[]
  public getDescendants (): TemplateNode[]
  public getDescendants (predicate?: Predicate<TemplateNode>): TemplateNode[] {
    const result: TemplateNode[] = []
    const queue: TemplateNode[] = [...this.getChildren()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getChildren())
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
    const queue: TemplateNode[] = [...this.getChildren()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getChildren())
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

  /**
   * After this method is run, the file is also updated and all tokens are in place.
   *
   * @param token
   * @param newTokenConfigs
   * @param addToLocalTokens
   *
   * @returns Created tokens, with their spans set correctly.
   *
   * @private
   */
  protected _addTokensAfter (token: Token,
                             newTokenConfigs: NewTokenConfig[],
                             { addToLocalTokens = false } = {},
  ): Token[] {
    if (newTokenConfigs.length == 0) return []

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
    if (addToLocalTokens) {
      const tokenIndex = this.tokens.indexOf(token)
      if (tokenIndex == -1) {
        const tokensArray = this.tokens.map(token => token.printForDebug()).join(', ')
        const error = [
          `Cannot add tokens after ${token.printForDebug()}, `,
          `because it was not found in the array ${tokensArray}.`,
        ].join('')
        throw new Error(error)
      }
      this.tokens.splice(tokenIndex + 1, 0, ...newTokens)
    }

    // Change tokens saved for the whole template.
    const newText = newTokenConfigs.map(({ text }) => text).join('')
    this.getTemplate()._addTokensAfter(token, newText, ...newTokens)

    return newTokens
  }

  public getTokens<T extends Token> (guard: (token: Token) => token is T): T[]
  public getTokens (predicate: Predicate<Token>): Token[]
  public getTokens (): Token[]
  public getTokens (predicate?: Predicate<Token>): Token[] {
    return predicate == null
      ? this.tokens
      : this.tokens.filter(predicate)
  }

  public getFirstToken (): Token | undefined {
    return getFirstElement(this.getTokens())
  }

  public getFirstTokenOrThrow (): Token {
    return getFirstElementOrThrow(this.getTokens())
  }

  public getLastToken (): Token | undefined {
    return getLastElement(this.getTokens())
  }

  public getLastTokenOrThrow (): Token {
    return getLastElementOrThrow(this.getTokens())
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

export abstract class ChildTemplateNode extends TemplateNode {
}

export class TextTemplateNode extends ChildTemplateNode {

  protected getTextToken (): Token<TokenType.TEXT> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TEXT)
  }

  public getText (): string {
    return this.getTextToken().toString()
  }

  public getChildren (): never[] {
    return []
  }

}

/**
 * Represents an interpolation node in the template.
 *
 * @example
 * text {{ interpolated.expression }} more text
 *
 * @todo Expose the inner structure of the expression instead of just a string.
 */
export class InterpolationTemplateNode extends ChildTemplateNode {

  public getTextToken () {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TEXT)
  }

  public getText (): string {
    return this.getTextToken().toString()
  }

  public getChildren (): never[] {
    return []
  }

  /**
   * Changes the text within interpolation. Causes re-parsig of the inner AST of the expression,
   * so these nodes will be forgotten. Easiest to write quickly, but the slowest method for
   * changing the interpolated expression. Prefer navigating the inner AST over using this method.
   *
   * @param newText - The text that will replace the old text.
   *
   * @example
   * interpolationNode.changeText('newText')
   *
   * @todo This needs to cause re-parse of the inner AST.
   */
  public changeText (newText: string): this {
    this._replaceTextByTokens([
      { token: this.getTextToken(), newText },
    ])
    return this
  }

  /**
   * Changes the whitespace around the expression so that each side has the given number of
   * whitespace.
   *
   * When zero is given as the argument, it acts the same as {@link trimText}.
   * When one is given as the argument, itacts the same as {@link padText}.
   *
   * @param padding - How many space characters should be placed around the string.
   *
   */
  public setTextPadding (padding: number): this {
    const trimmedText = this.getText().trim()
    const length = trimmedText.length
    const newText = trimmedText
      .padStart(length + padding)
      .padEnd(length + 2 * padding)
    this.changeText(newText)
    return this
  }

  /**
   * Removes any space inside the interpolation brackets.
   *
   * @see setTextPadding
   */
  public trimText (): this {
    return this.setTextPadding(0)
  }

  /**
   * Formats interpolation so exactly one space character is around each side of the expression.
   *
   * @see setTextPadding
   */
  public padText (): this {
    return this.setTextPadding(1)
  }

}

// endregion Text and interpolation

// region Elements, ng-template and ng-container

export abstract class ParentTemplateNode extends TemplateNode {

  protected children: Array<TemplateNode> = []

  protected attributes: Array<AttributeTemplateNode> = []

  /**
   * @internal When we already have children set up properly.
   * @param children
   * @private
   */
  public _setChildren (children: Array<TemplateNode>) {
    this.children = children
  }

  /**
   * Add new children to the children of this node, starting at the specified index.
   * Also set the parent (by default), in which case the method will throw if the node
   * is already a part of the tree (because it won't allow overwriting the parent).
   *
   * Expects the children to already have their tokens properly set.
   * This is a low-level method. @todo What to use instead?
   *
   * @param newChildren - The child to add.
   * @param index - This will become the index of the new child.
   * @param doNotSetParent - Should setting the parent of `newChild` be skipped.
   *
   * @throws Error - When the node is forgotten. @todo Create a separate error object for this.
   * @throws Error - When the given index would create holes in the array.
   *
   * @see removeChildAtIndex
   */
  public addChildrenAtIndex (newChildren: Array<Exclude<TemplateNode, RootTemplateNode>>,
                             index: number,
                             {
                               doNotSetParent = false,
                             } = {}): void {
    this.assertNotForgotten(`Cannot perform "addChildrenAtIndex".`)
    const children = this.getChildren()
    if (index < 0 || index > children.length) throw new Error(`Index ${index} out of bounds [0, ${children.length - 1}].`)

    children.splice(index, 0, ...newChildren)
    if (!doNotSetParent) {
      newChildren.forEach(newChild => {
        newChild.setParent(this, { allowOverwriting: false })
      })
    }
  }

  /**
   * Remove specific children from the children of this node, starting from the specified index.
   *
   * @param index - The index of the child node that will be removed.
   * @param deleteCount - How many children to delete?
   * @param doNotUnsetParent - Should unsetting the parent be skipped.
   * @param doNotForget - Should forgetting the node be skipped.
   */
  public removeChildrenAtIndex (index: number,
                                deleteCount: number,
                                {
                                  doNotUnsetParent = false,
                                  doNotForget = false,
                                } = {}): void {
    this.assertNotForgotten(`Cannot perform "removeChildAtIndex".`)
    if (deleteCount == 0) return
    const children = this.getChildren()
    const hi = children.length - deleteCount
    if (index < 0 || index > hi) throw new Error(`Argument "index" would be out of bounds for some indexes. ` +
      `Expected a number between 0 and ${hi} (inclusive), but got ${index}.`)
    const deletedChildren = children.splice(index, deleteCount)
    if (!doNotUnsetParent) deletedChildren.forEach(deletedChild => deletedChild.unsetParent())
    if (!doNotForget) deletedChildren.forEach(deletedChild => deletedChild.forget())
  }

  /**
   * @todo docs
   *
   * @param child
   * @param deleteCount
   * @param doNotUnsetParent
   * @param doNotForget
   * @param inclusive
   *
   * @see removeChildAtIndex
   */
  public removeChildren (child: TemplateNode,
                         deleteCount: number,
                         {
                           doNotUnsetParent = false,
                           doNotForget = false,
                         } = {}): void {
    const children = this.getChildren()
    const index = children.indexOf(child)
    if (index == -1) throw new Error(`Cannot remove that child because it's not in the list of children.`)
    this.removeChildrenAtIndex(index, deleteCount, { doNotUnsetParent, doNotForget })
  }

  /**
   * @todo docs
   */
  public addAttributesAtIndex (newAttributes: Array<AttributeTemplateNode>,
                               index: number,
                               {
                                 doNotSetParent = false,
                               } = {}): void {
    this.assertNotForgotten(`Cannot perform "addAttributesAtIndex".`)
    const attributes = this.getAttributes()
    attributes.splice(index, 0, ...newAttributes)
    if (!doNotSetParent) {
      newAttributes.forEach(newAttribute => {
        newAttribute.setParent(this, { allowOverwriting: false })
      })
    }
  }

  /**
   * @todo docs
   */
  public removeAttributesAtIndex (index: number,
                                  deleteCount: number,
                                  {
                                    doNotUnsetParent = false,
                                    doNotForget = false,
                                  } = {}): void {
    this.assertNotForgotten(`Cannot perform "removeAttributesAtIndex".`)
    if (deleteCount == 0) return
    const attributes = this.getAttributes()
    const hi = attributes.length - deleteCount
    if (index < 0 || index > hi) throw new Error(`Argument "index" would be out of bounds for some indexes. ` +
      `Expected a number between 0 and ${hi} (inclusive), but got ${index}.`)
    const deletedAttributes = attributes.splice(index, deleteCount)
    if (!doNotUnsetParent) deletedAttributes.forEach(deletedAttribute => deletedAttribute.unsetParent())
    if (!doNotForget) deletedAttributes.forEach(deletedAttribute => deletedAttribute.forget())
  }

  /**
   * @todo docs
   */
  public removeAttributes (attribute: AttributeTemplateNode,
                           deleteCount: number,
                           {
                             doNotUnsetParent = false,
                             doNotForget = false,
                           } = {}): void {
    const attributes = this.getAttributes()
    const index = attributes.indexOf(attribute)
    if (index == -1) throw new Error(`Cannot remove that attribute because it's not in the list of attributes.`)
    this.removeAttributesAtIndex(index, deleteCount, { doNotUnsetParent, doNotForget })
  }

  public insert<T extends TemplateNodeTypeWithoutRoot> (
    insertionRule: InsertionRule<this, TemplateNode>,
    structure: TemplateNodeTypeToTemplateNodeStructureMap[T],
  ): TemplateNodeTypeToTemplateNodeMap[T] {
    const { previousToken } = insertionRule.getInfo(this)
    const { tokenConfigs, ctor } = createNode(structure)
    const tokens = this._addTokensAfter(previousToken, tokenConfigs)
    const newNode = new ctor(this.project, tokens, this.getTemplate())
    insertionRule.insert(this, newNode)

    if (isElementLikeStructure(structure) && structure.children != null) {
      // Note: Circular references disallow using the guard here.
      if (!(newNode instanceof ParentTemplateNode)) {
        throw new Error(`Programming error. Expected the result of creating an element-like structure to be a ParentTemplateNode.`)
      }
      structure.children.forEach(childStructure => newNode.insert(lastChild(), childStructure))
    }

    return newNode
  }

  public getTagOpenStartToken (): Token<TokenType.TAG_OPEN_START> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TAG_OPEN_START)
  }

  public getTagOpenEndToken (): Token<TokenType.TAG_OPEN_END> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TAG_OPEN_END)
  }

  public getTagCloseToken (): Token<TokenType.TAG_CLOSE> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.TAG_CLOSE)
  }

  public getStartTagNameLocationSpan (): LocationSpan {
    const token = this.getTagOpenStartToken()
    return token.locationSpan.clone().moveStartBy(1) // leading "<"
  }

  public getEndTagNameLocationSpan (): LocationSpan {
    const token = this.getTagCloseToken()
    return token.locationSpan.clone().moveEndBy(-1) // trailing ">"
  }

  public _setAttributes (attributes: AttributeTemplateNode[]) {
    this.attributes = attributes
  }

  public getChildren<T extends TemplateNode> (guard: (node: TemplateNode) => node is T): T[]
  public getChildren (predicate?: Predicate<TemplateNode> | undefined): TemplateNode[]
  public getChildren (predicate?: Predicate<TemplateNode>): TemplateNode[] {
    return predicate == null
      ? this.children
      : this.children.filter(predicate)
  }

  public getFirstChild<T extends TemplateNode> (guard: (node: TemplateNode) => node is T): T | undefined
  public getFirstChild (predicate?: Predicate<TemplateNode> | undefined): TemplateNode | undefined
  public getFirstChild (predicate?: Predicate<TemplateNode>): TemplateNode | undefined {
    const children = this.getChildren()
    return predicate == null
      ? children[0]
      : children.find(predicate)
  }

  public getFirstChildOrThrow<T extends TemplateNode> (guard: (node: TemplateNode) => node is T): T
  public getFirstChildOrThrow (predicate?: Predicate<TemplateNode> | undefined): TemplateNode
  public getFirstChildOrThrow (predicate?: Predicate<TemplateNode>): TemplateNode {
    return throwIfUndefined(this.getFirstChild(predicate), `Expected to find an attribute.`)
  }

  public getFirstChildIf<T extends TemplateNode> (guard: (node: TemplateNode) => node is T): T | undefined
  public getFirstChildIf (predicate: Predicate<TemplateNode>): TemplateNode | undefined
  public getFirstChildIf (predicate: Predicate<TemplateNode>): TemplateNode | undefined {
    const firstChild = this.getFirstChild()
    return firstChild == null
      ? undefined
      : predicate(firstChild) ? firstChild : undefined
  }

  public getFirstChildIfOrThrow<T extends TemplateNode> (guard: (node: TemplateNode) => node is T, errMsg?: string): T
  public getFirstChildIfOrThrow (predicate: Predicate<TemplateNode>, errMsg?: string): TemplateNode
  public getFirstChildIfOrThrow (predicate: Predicate<TemplateNode>, errMsg?: string): TemplateNode {
    return throwIfUndefined(
      this.getFirstChildIf(predicate),
      concatErrors(`Expected the first child to satisfy a certain condition.`, errMsg),
    )
  }

  public getAttributes<T extends AttributeTemplateNode> (guard: (attr: AttributeTemplateNode) => attr is T): T[]
  public getAttributes (predicate?: Predicate<AttributeTemplateNode> | undefined): AttributeTemplateNode[]
  public getAttributes (predicate?: Predicate<AttributeTemplateNode>): AttributeTemplateNode[] {
    return predicate == null
      ? this.attributes
      : this.attributes.filter(predicate)
  }

  public getFirstAttribute<T extends AttributeTemplateNode> (guard: (attr: AttributeTemplateNode) => attr is T): T | undefined
  public getFirstAttribute (predicate?: Predicate<AttributeTemplateNode> | undefined): AttributeTemplateNode | undefined
  public getFirstAttribute (predicate?: Predicate<AttributeTemplateNode>): AttributeTemplateNode | undefined {
    const attributes = this.getAttributes()
    return predicate == null
      ? attributes[0]
      : attributes.find(predicate)
  }

  public getFirstAttributeOrThrow<T extends AttributeTemplateNode> (guard: (attr: AttributeTemplateNode) => attr is T): T
  public getFirstAttributeOrThrow (predicate?: Predicate<AttributeTemplateNode> | undefined): AttributeTemplateNode
  public getFirstAttributeOrThrow (predicate?: Predicate<AttributeTemplateNode>): AttributeTemplateNode {
    return throwIfUndefined(this.getFirstAttribute(predicate), `Expected to find an attribute.`)
  }

}

export class RootTemplateNode extends ParentTemplateNode {

  private roots?: Array<TemplateNode>

  public constructor (project: Project,
                      template: Template) {
    super(project, [new Token(TokenType.TRIVIA, [], LocationSpan.FromFullFile(template.getFile()))], template)
  }

  public getChildren (): TemplateNode[] {
    return this.getRoots()
  }

  /**
   * @param roots
   *
   * @internal
   */
  public _setRoots (roots: TemplateNode[]) {
    if (this.roots != null) {
      throw new Error(`Roots have already been set.`)
    }
    this.roots = roots
  }

  /**
   * Get the root-level template nodes, which represent the roots of the template's forest.
   */
  private getRoots () {
    return throwIfUndefined(this.roots, `Forgot to call setRoots.`)
  }

}


export class ElementTemplateNode extends ParentTemplateNode {

  public getTagName (): string {
    return this.getStartTagNameLocationSpan().getText()
  }

  public hasTagName (tagName: string): boolean {
    return this.getTagName() == tagName
  }

  public changeTagName (newTagName: string): this {
    this._replaceTextByTokens([
      { token: this.getTagOpenStartToken(), newText: '<' + newTagName },
      { token: this.getTagCloseToken(), newText: '</' + newTagName + '>' },
    ])
    return this
  }

  /**
   * @todo
   * @param classNames
   */
  public addClassNames (...classNames: string[]): this {
    throw new Error(`Not implemented.`)
  }

  /**
   * @todo
   * @param classNames
   */
  public removeClassNames (...classNames: string[]): this {
    throw new Error(`Not implemented.`)
  }

  /**
   * @todo
   * @param id
   * @param overwrite
   * @param throwIfOverWrite
   */
  public setId (id: string, { overwrite = false, throwIfOverWrite = false } = {}): this {
    throw new Error(`Not implemented.`)
  }

  /**
   * @todo
   * @param throwIfAlreadyNotPresent
   */
  public removeId ({ throwIfAlreadyNotPresent = false } = {}): this {
    throw new Error(`Not implemented.`)
  }

}

export class NgTemplateTemplateNode extends ParentTemplateNode {

  public getTagName (): string {
    return `ng-template`
  }

}

export class NgContainerTemplateNode extends ParentTemplateNode {

  public getTagName (): string {
    return `ng-container`
  }

}

// endregion Elements, ng-template and ng-container

// region Attributes (text attributes, inputs, outputs)

export abstract class AttributeTemplateNode extends TemplateNode {

  protected getNameToken (): Token<TokenType.ATTR_NAME> {
    return this.getFirstTokenOfTypeOrThrow(TokenType.ATTR_NAME)
  }

  protected getValueToken (): Token<TokenType.ATTR_VALUE> | undefined {
    return this.getFirstTokenOfType(TokenType.ATTR_VALUE)
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
    this._addTokensAfter(this.getNameToken(), newTokenConfig, { addToLocalTokens: true })

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
      this.addAttributeValueOrThrowIfAlreadyExists(newValue, `This is a programming error and is likely a bug.`)
    }
    return this
  }

  public getChildren (): never[] {
    return []
  }

}

export class TextAttributeTemplateNode extends AttributeTemplateNode {

  public getName (): string {
    return this.getAttributeNameString()
  }

  public getValue (): string | undefined {
    return this.getAttributeValueString()
  }

  public getValueOrThrow (customErrMsg?: string): string {
    return this.getAttributeValueStringOrThrow(customErrMsg)
  }

}

export class BoundAttributeTemplateNode extends AttributeTemplateNode {

}

export class BoundEventTemplateNode extends AttributeTemplateNode {

  public getHandler (): string | undefined {
    return this.getAttributeValueString()
  }

  public getHandlerOrThrow (customErrMsg?: string): string {
    return this.getAttributeValueStringOrThrow(customErrMsg)
  }

}

// export class BananaInTheBoxTemplateNode extends AttributeTemplateNode {
//
//   public getTemplateChildren (): TemplateNode[] {
//     return []
//   }
//
// }
//
// export class ReferenceTemplateNode extends AttributeTemplateNode {
//
//   public getTemplateChildren (): TemplateNode[] {
//     return []
//   }
//
// }

// endregion Attributes (text attributes, inputs, outputs)

// export class CommentTemplateNode extends TemplateNode {
//
//   private getRawTextToken (): Token<TokenType.RAW_TEXT> {
//     return this.getFirstTokenOfTypeOrThrow(TokenType.RAW_TEXT)
//   }
//
//   public getValue (): string {
//     return this.getRawTextToken().toString()
//   }
//
//   public getTemplateChildren (): TemplateNode[] {
//     return []
//   }
//
// }
//
// export abstract class BindingTargetTemplateNode extends TemplateNode {
// }
//
// export class PropertyBindingTargetTemplateNode extends BindingTargetTemplateNode {
//
//   public constructor (project: Project,
//                       tokens: Token[],
//                       template: Template,
//                       protected text: string,
//                       protected name: string) {
//     super(project, tokens, template)
//   }
//
//   public getText (): string {
//     return this.text
//   }
//
//   public getName (): string {
//     return this.name
//   }
//
//   // public isBare (): boolean {
//   //
//   // }
//   //
//   // public isWithBrackets (): boolean {
//   //
//   // }
//   //
//   // public isWithBindPrefix (): boolean {
//   //
//   // }
//
//   public getTemplateChildren (): TemplateNode[] {
//     return []
//   }
//
// }
//
// export class EventBindingTargetTemplateNode extends BindingTargetTemplateNode {
//
//   public constructor (project: Project,
//                       tokens: Token[],
//                       template: Template,
//                       protected text: string,
//                       protected name: string) {
//     super(project, tokens, template)
//   }
//
//   public getText (): string {
//     return this.text
//   }
//
//   public getName (): string {
//     return this.name
//   }
//
//   public getTemplateChildren (): TemplateNode[] {
//     return []
//   }
//
// }
//
// export class ExpressionTemplateNode extends TemplateNode {
//
//   public getTemplateChildren (): TemplateNode[] {
//     return []
//   }
//
// }
//
// export class StatementTemplateNode extends TemplateNode {
//
//   public getTemplateChildren (): TemplateNode[] {
//     return []
//   }
//
// }
