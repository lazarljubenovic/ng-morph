import { NgAstNode } from '../ng-ast-node'
import { Project } from '../../../project'
import * as tg from 'type-guards'
import * as templateNodeTypeGuards from './template-nodes-type-guards'
import { RootLevelTemplateNode, TemplateNode } from './template-nodes'
import { fromHtmlNode } from './factory'
import { LocationSpan } from '../location'
import { Predicate, TapFn, throwIfUndefined } from '../../../utils'
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
                                  locationSpan: LocationSpan,
                                  templateConfig: TemplateConfig) {
    const templateString = locationSpan.getText()
    const url = locationSpan.getFile().getUri()
    const tokenizeResult = tokenize(templateString, url, getHtmlTagDefinition)
    const parseTreeResult = htmlParser.parse(tokenizeResult, url)
    const template = new Template(project, locationSpan, tokenizeResult.tokens)
    const roots = parseTreeResult.rootNodes.flatMap(ngNode => fromHtmlNode(project, template, templateConfig, ngNode))

    if (!tg.isArrayOf(templateNodeTypeGuards.isRootLevel)(roots)) {
      console.log(roots)
      throw new Error(`Expected roots to be roots.`)
    }

    template.setRoots(roots)
    return template
  }

  private roots?: RootLevelTemplateNode[]

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      private tokens: Token[]) {
    super(project, locationSpan)

  }

  public getTokens (): Token[] {
    return this.tokens
  }

  public getText() {
    return this.getTokens().map(token => token.toString()).join('')
  }

  public getTokenIndex (token: Token): number {
    const index = this.getTokens().indexOf(token)
    if (index == -1) throw new Error(`Token of type ${token.typeName} (${token}) not found.`)
    return index
  }

  public forEachTokenBetween (start: Token | number,
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

  public forEachTokenAfter (token: Token | number,
                            fn: TapFn<Token>,
                            { inclusive = false } = {}): void {
    const start = typeof token == 'number' ? token : this.getTokenIndex(token)
    const end = this.getTokens().length
    this.forEachTokenBetween(start, end, fn, { inclusiveStart: inclusive, inclusiveEnd: false })
  }

  public setRoots (roots: RootLevelTemplateNode[]) {
    if (this.roots != null) {
      throw new Error(`Roots have already been set.`)
    }
    this.roots = roots
  }

  public getRoots () {
    return throwIfUndefined(this.roots, `Forgot to call setRoots.`)
  }

  public getTemplateNodes<T extends TemplateNode> (guard: tg.Guard<T>): T[]
  public getTemplateNodes (predicate?: Predicate<TemplateNode> | undefined): TemplateNode[]
  public getTemplateNodes (predicate?: Predicate<TemplateNode>): TemplateNode[] {
    const result: TemplateNode[] = []
    const queue: TemplateNode[] = [...this.getRoots()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getTemplateChildren())
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
    const queue: TemplateNode[] = [...this.getRoots()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getTemplateChildren())
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
    const queue: TemplateNode[] = [...this.getRoots()]
    while (queue.length > 0) {
      const node = queue.shift()!
      queue.push(...node.getTemplateChildren())
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
