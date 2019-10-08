import { NgAstNode } from '../ng-ast-node'
import { Project } from '../../../project'
import * as tg from 'type-guards'
import { RootTemplateNode, TemplateNode } from './template-nodes'
import { fromHtmlNode } from './factory'
import { LocationFile, LocationSpan } from '../location'
import { getFirstElementOrThrow, getLastElementOrThrow, Predicate, TapFn, throwIfUndefined } from '../../../utils'
import { HtmlParser } from './tokenizer/html_parser'
import { getHtmlTagDefinition } from './tokenizer/html_tags'
import { Token, tokenize } from './tokenizer/lexer'

const htmlParser = new HtmlParser()

export class TemplateConfig {

  public constructor (
    private interpolationDelimitersOpen: string,
    private interpolationDelimitersClose: string,
  ) {
  }

}

export const defaultTemplateConfig = new TemplateConfig('{{', '}}')

export class Template extends NgAstNode {

  public static FromLocationSpan (project: Project,
                                  temporaryLocationSpan: LocationSpan,
                                  templateConfig: TemplateConfig) {
    const templateString = temporaryLocationSpan.getText()
    const url = temporaryLocationSpan.getFile().getUri()
    const tokenizeResult = tokenize(templateString, url, getHtmlTagDefinition)
    const parseTreeResult = htmlParser.parse(tokenizeResult, url)
    const reactiveLocationSpan = LocationSpan.ReactiveFromSeveralOrdered(...tokenizeResult.tokens.map(tk => tk.locationSpan))
    const template = new Template(project, reactiveLocationSpan, tokenizeResult.tokens)
    const roots = parseTreeResult.rootNodes.flatMap(ngNode => fromHtmlNode(project, template, templateConfig, ngNode))
    template._setRoots(roots)
    return template
  }

  private root?: RootTemplateNode

  private constructor (project: Project,
                      locationSpan: LocationSpan,
                      private tokens: Token[]) {
    super(project, locationSpan)

  }

  public getText () {
    return this.locationSpan.toString()
  }

  public getFile (): LocationFile {
    return this.locationSpan.getFile()
  }

  public getTokens (): Token[] {
    return this.tokens
  }

  public getTokenIndex (token: Token): number {
    const index = this.getTokens().indexOf(token)
    if (index == -1) {
      const tokensArray = this.tokens.map(token => token.printForDebug()).join(', ')
      const error = [
        `Cannot add tokens after ${token.printForDebug()}, `,
        `because it was not found in the array ${tokensArray}.`,
      ].join('')
      throw new Error(error)
    }
    return index
  }

  /**
   * Performs a given functions for each token that the template is composed of, between two given tokens.
   * Either indices or tokens themselves can be given. The inclusiveness of boundaries is configurable.
   *
   * @param start - Where to start from; either the index of the token or the token itself.
   * @param end - Where to end; either the index of the token or the token itself.
   * @param fn - The function to perform over each token. Its arguments are the token, index and the whole array.
   * @param { inclusiveStart, inclusiveEnd } - Should `start`/`end` be included in the iteration?
   *
   * @internal
   */
  public _forEachTokenBetween (start: Token | number,
                               end: Token | number,
                               fn: TapFn<Token>,
                               { inclusiveStart = false, inclusiveEnd = false } = {}): void {
    start = typeof start == 'number' ? start : this.getTokenIndex(start)
    end = typeof end == 'number' ? end : this.getTokenIndex(end)
    const min = start + (inclusiveStart ? 0 : 1)
    const max = end - (inclusiveEnd ? 0 : 1)
    const tokens = this.getTokens()
    for (let index = min; index <= max; index++) {
      const token = tokens[index]
      fn(token, index, tokens)
    }
  }

  /**
   * Performs a given function for each token that the template is composed of, after the given token.
   * Either the index o the token itself can eb given. The inclusiveness of the first node is configurable.
   *
   * @param token - Where to start from either the index of the token or the token itself.
   * @param fn - The function to perform over each token. Its arguments are the token, index and the whole array.
   * @param inclusive - Should `token` be included in the iteration?
   * @internal
   */
  public _forEachTokenAfter (token: Token | number,
                             fn: TapFn<Token>,
                             { inclusive = false } = {}): void {
    const start = typeof token == 'number' ? token : this.getTokenIndex(token)
    const end = this.getTokens().length
    this._forEachTokenBetween(start, end, fn, { inclusiveStart: inclusive, inclusiveEnd: false })
  }

  /**
   * Adds tokens after the specified token.
   * Also updates the file content.
   *
   * @param tokenOrIndex - The anchor token ref, or its index. New tokens are added after this one.
   * @param newText - The collected text of all new tokens.
   * @param newTokens - Tokens to add.
   *
   * @internal
   */
  public _addTokensAfter (tokenOrIndex: Token | number,
                          newText: string,
                          ...newTokens: Token[]): void {
    if (newTokens.length == 0) return
    // TODO: Assert index
    const index = typeof tokenOrIndex == 'number' ? tokenOrIndex : this.getTokenIndex(tokenOrIndex)

    // Change the file contents.
    const token = this.tokens[index]
    const offset = token.locationSpan.getEndOffset()
    const file = token.locationSpan.getFile()
    file.insertText(offset, newText)

    // Add tokens.
    this.tokens.splice(index + 1, 0, ...newTokens)

    // Move tokens.
    const firstNewToken = getFirstElementOrThrow(newTokens)
    const lastNewToken = getLastElementOrThrow(newTokens)
    const diff = lastNewToken.locationSpan.getEndOffset() - firstNewToken.locationSpan.getStartOffset()
    this._forEachTokenAfter(lastNewToken, token => {
      token.locationSpan.moveBy(diff)
    }, { inclusive: false })
  }

  /**
   * Delete a certain amount of tokens (by default, one) after the given one.
   * Deleting the given token is configurable.
   *
   * @param token - The anchor token that marks the start of deletion. Either its index of the token reference itself.
   * @param inclusive - Should the given anchor token also be deleted. Not by default.
   * @param deleteCount - How many tokens to delete in total, in succession. One by default.
   *
   * @internal
   */
  public _deleteTokens (token: Token | number,
                        { inclusive = false, deleteCount = 1 } = {}): void {
    if (deleteCount == 0) return

    const tokenIndex = typeof token == 'number' ? token : this.getTokenIndex(token)
    const index = tokenIndex + (inclusive ? 0 : 1)
    // TODO: Assert index

    // Forget tokens that will be removed.
    for (let offset = 0; offset < deleteCount; offset++) {
      const tokenToForgetIndex = index + offset
      const tokenToForget = this.tokens[tokenToForgetIndex]
      tokenToForget._forget()
    }

    // Remove tokens from the array of all tokens in the template.
    this.tokens.splice(index, deleteCount)
  }

  /**
   * Set the roots. We cannot do this through constructor because we need the instance in order to roots.
   * The getter ({@link getRoot}) makes sure that we don't try accessing roots before we assign them.
   *
   * @param roots - The array of root-level template nodes, which represent the roots of the template's forest.
   *
   * @internal
   */
  public _setRoots (roots: TemplateNode[]) {
    if (this.root != null) {
      throw new Error(`Roots have already been set.`)
    }
    this.root = new RootTemplateNode(this.project, this)
    this.root._setRoots(roots)
  }

  /**
   * Get the root-level template nodes, which represent the roots of the template's forest.
   */
  public getRoot () {
    return throwIfUndefined(this.root, `Forgot to call setRoots.`)
  }

  public getTemplateNodes<T extends TemplateNode> (guard: tg.Guard<T>): T[]
  public getTemplateNodes (predicate?: Predicate<TemplateNode> | undefined): TemplateNode[]
  public getTemplateNodes (predicate?: Predicate<TemplateNode>): TemplateNode[] {
    const result: TemplateNode[] = []
    const queue: TemplateNode[] = [...this.getRoot().getChildren()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getChildren())
      if (predicate != null && predicate(node)) {
        result.push(node)
      }
    }
    return result
  }

  public getTemplateNodeIfSingle<T extends TemplateNode> (guard: tg.Guard<T>): T | undefined
  public getTemplateNodeIfSingle (predicate: Predicate<TemplateNode>): TemplateNode | undefined
  public getTemplateNodeIfSingle (predicate: Predicate<TemplateNode>): TemplateNode | undefined {
    let result: TemplateNode | undefined
    const queue: TemplateNode[] = [...this.getRoot().getChildren()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getChildren())
      if (predicate(node)) {
        if (result === undefined) {
          // If not already found, save it. We keep going to see if it's the only one.
          result = node
        } else {
          // If result already found but we matched another one, then return undefined immediately.
          return undefined
        }
      }
    }
    return result
  }

  public getTemplateNodeIfSingleOrThrow<T extends TemplateNode> (guard: tg.Guard<T>): T
  public getTemplateNodeIfSingleOrThrow (predicate: Predicate<TemplateNode>): TemplateNode
  public getTemplateNodeIfSingleOrThrow (predicate: Predicate<TemplateNode>): TemplateNode {
    return throwIfUndefined(this.getTemplateNodeIfSingle(predicate), `Expected to find a single template node.`)
  }

  public getFirstTemplateNode<T extends TemplateNode> (guard: tg.Guard<T>): T | undefined
  public getFirstTemplateNode (predicate?: Predicate<TemplateNode> | undefined): TemplateNode | undefined
  public getFirstTemplateNode (predicate?: Predicate<TemplateNode>): TemplateNode | undefined {
    const queue: TemplateNode[] = [...this.getRoot().getChildren()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getChildren())
      if (predicate != null && predicate(node)) {
        return node
      }
    }
    return undefined
  }

  public getFirstTemplateNodeOrThrow<T extends TemplateNode> (guard: tg.Guard<T>): T
  public getFirstTemplateNodeOrThrow (predicate?: Predicate<TemplateNode> | undefined): TemplateNode
  public getFirstTemplateNodeOrThrow (predicate?: Predicate<TemplateNode>): TemplateNode {
    return throwIfUndefined(this.getFirstTemplateNode(predicate), `Expected to find at least one template node.`)
  }

}
