import {
  BoundAttributeTemplateNode,
  BoundEventTemplateNode,
  ElementTemplateNode,
  InterpolationTemplateNode,
  NewTokenConfig,
  NgContainerTemplateNode,
  NgTemplateTemplateNode,
  ParentTemplateNode,
  ReferenceTemplateNode,
  RootTemplateNode,
  TemplateNode,
  TemplateNodeConstructor,
  TextAttributeTemplateNode,
  TextTemplateNode,
} from './template-nodes'
import { TokenType } from './tokenizer/lexer'
import * as tg from 'type-guards'
import { ValueOf } from '../../../utils'

export enum TemplateNodeType {
  Root,
  Text,
  Interpolation,
  Element,
  NgTemplate,
  NgContainer,
  TextAttribute,
  BoundAttribute,
  BoundEvent,
  Reference,
}

export type TemplateNodeTypeWithoutRoot = Exclude<TemplateNodeType, TemplateNodeType.Root>

export type TemplateNodeTypeWithoutRootWithoutAttributes = Exclude<TemplateNodeTypeWithoutRoot, AttributeLikeTemplateNodeType>

export type ElementLikeTemplateNodeType =
  | TemplateNodeType.Element
  | TemplateNodeType.NgTemplate
  | TemplateNodeType.NgContainer

export type ParentTemplateNodeType =
  | TemplateNodeType.Root
  | ElementLikeTemplateNodeType

export type TextLikeTemplateNodeType =
  | TemplateNodeType.Text
  | TemplateNodeType.Interpolation

export type AttributeLikeTemplateNodeType =
  | TemplateNodeType.TextAttribute
  | TemplateNodeType.BoundAttribute
  | TemplateNodeType.BoundEvent
  | TemplateNodeType.Reference

export type ChildTemplateNodeType =
  | TextLikeTemplateNodeType
  | AttributeLikeTemplateNodeType

export const isElementLikeTemplateNodeType = tg.isEnum<ElementLikeTemplateNodeType>(
  TemplateNodeType.Element,
  TemplateNodeType.NgTemplate,
  TemplateNodeType.NgContainer,
)

export const isAttributeLikeTemplateNodeType = tg.isEnum<AttributeLikeTemplateNodeType>(
  TemplateNodeType.TextAttribute,
  TemplateNodeType.BoundAttribute,
  TemplateNodeType.BoundEvent,
  TemplateNodeType.Reference,
)

const isStructure = <T extends TemplateNodeTypeWithoutRoot> (guard: (type: TemplateNodeType) => type is T) => {
  return (structure: StructureBase<TemplateNodeType>): structure is TemplateNodeTypeToTemplateNodeStructureMap[T] => {
    return guard(structure.type)
  }
}

export const isElementLikeStructure = isStructure(isElementLikeTemplateNodeType)
export const isAttributeLikeStructure = isStructure(isAttributeLikeTemplateNodeType)

export interface TemplateNodeTypeToTemplateNodeStructureMap {
  [TemplateNodeType.Root]: never
  [TemplateNodeType.Text]: TextTemplateNodeStructure
  [TemplateNodeType.Interpolation]: InterpolationTemplateNodeStructure
  [TemplateNodeType.Element]: ElementTemplateNodeStructure
  [TemplateNodeType.NgTemplate]: NgTemplateTemplateNodeStructure
  [TemplateNodeType.NgContainer]: NgContainerTemplateNodeStructure
  [TemplateNodeType.TextAttribute]: TextAttributeTemplateNodeStructure
  [TemplateNodeType.BoundAttribute]: BoundAttributeTemplateNodeStructure
  [TemplateNodeType.BoundEvent]: BoundEventTemplateNodeStructure
  [TemplateNodeType.Reference]: ReferenceTemplateNodeStructure
}

type TemplateNodeStructure = ValueOf<TemplateNodeTypeToTemplateNodeStructureMap>

export interface TemplateNodeTypeToTemplateNodeMap {
  [TemplateNodeType.Root]: RootTemplateNode
  [TemplateNodeType.Text]: TextTemplateNode
  [TemplateNodeType.Interpolation]: InterpolationTemplateNode
  [TemplateNodeType.Element]: ElementTemplateNode
  [TemplateNodeType.NgTemplate]: NgTemplateTemplateNode
  [TemplateNodeType.NgContainer]: NgContainerTemplateNode
  [TemplateNodeType.TextAttribute]: TextAttributeTemplateNode
  [TemplateNodeType.BoundAttribute]: BoundAttributeTemplateNode
  [TemplateNodeType.BoundEvent]: BoundEventTemplateNode
  [TemplateNodeType.Reference]: ReferenceTemplateNode
}

type TemplateNodeTypeToTemplateNodeMapGeneric<T extends TemplateNodeType> = TemplateNodeTypeToTemplateNodeMap[T]

export type TemplateNodeToTemplateNodeType<T extends TemplateNode> = T extends TemplateNodeTypeToTemplateNodeMapGeneric<infer V> ? V : never
export type ParentTemplateNodeToParentTemplateNodeType<T extends ParentTemplateNode> =
  T extends RootTemplateNode
    ? TemplateNodeType.Root
    : T extends ElementTemplateNode
      ? TemplateNodeType.Element
      : T extends NgTemplateTemplateNode
        ? TemplateNodeType.NgTemplate
        : T extends NgContainerTemplateNode
          ? TemplateNodeType.NgContainer
          : T extends ReferenceTemplateNode
            ? TemplateNodeType.Reference
            : never

interface CreateResult<T extends TemplateNodeTypeWithoutRoot> {
  ctor: TemplateNodeConstructor<TemplateNodeTypeToTemplateNodeMap[T]>,
  tokenConfigs: NewTokenConfig[]
}

type Create<T extends TemplateNodeTypeWithoutRoot> = (
  structure: TemplateNodeTypeToTemplateNodeStructureMap[T],
) => CreateResult<T>

export interface StructureBase<T extends TemplateNodeType> {
  type: T
}

export interface TextTemplateNodeStructure extends StructureBase<TemplateNodeType.Text> {
  text: string
}

/**
 * @todo: Allow inner AST structure
 */
export interface InterpolationTemplateNodeStructure extends StructureBase<TemplateNodeType.Interpolation> {
  text: string
}

interface ElementLike<T extends ElementLikeTemplateNodeType> extends StructureBase<T> {
  // attributes: any // TODO
  children?: Array<TemplateNodeTypeToTemplateNodeStructureMap[TemplateNodeTypeWithoutRootWithoutAttributes]>
}

export interface ElementTemplateNodeStructure extends ElementLike<TemplateNodeType.Element> {
  tagName: string
}

export interface NgTemplateTemplateNodeStructure extends ElementLike<TemplateNodeType.NgTemplate> {
}

export interface NgContainerTemplateNodeStructure extends ElementLike<TemplateNodeType.NgContainer> {
}

export interface TextAttributeTemplateNodeStructure extends StructureBase<TemplateNodeType.TextAttribute> {
  name: string
  value: string | undefined
  withoutQuotes?: boolean
}

export interface BoundAttributeTemplateNodeStructure extends StructureBase<TemplateNodeType.BoundAttribute> {
  name: string
  value: string // TODO: inner AST
  usePrefix?: boolean
}

export interface BoundEventTemplateNodeStructure extends StructureBase<TemplateNodeType.BoundEvent> {
  name: string
  value: string // TODO: inner AST
  usePrefix?: boolean
}

export interface ReferenceTemplateNodeStructure extends StructureBase<TemplateNodeType.Reference> {
  name: string
}

// const createText: Create<TemplateNodeType.Text> =
// const createInterpolation: Create<TemplateNodeType.Interpolation> =
const createElementLikeTokenConfigs = (tagName: string): NewTokenConfig[] => {
  return [
    { type: TokenType.TAG_OPEN_START, text: `<${tagName}` },
    { type: TokenType.TAG_OPEN_END, text: '>' },
    { type: TokenType.TAG_CLOSE, text: `</${tagName}>` },
  ]
}

const templateNodeTypeToCreateMap: { [T in TemplateNodeTypeWithoutRoot]: Create<T> } = {
  [TemplateNodeType.Text]: structure => ({
    ctor: TextTemplateNode,
    tokenConfigs: [
      { type: TokenType.TEXT, text: structure.text },
    ],
  }),
  [TemplateNodeType.Interpolation]: structure => ({
    ctor: InterpolationTemplateNode,
    tokenConfigs: [
      { type: TokenType.TEXT, text: structure.text },
    ],
  }),
  [TemplateNodeType.Element]: structure => ({
    ctor: ElementTemplateNode,
    tokenConfigs: createElementLikeTokenConfigs(structure.tagName),
  }),
  [TemplateNodeType.NgTemplate]: structure => ({
    ctor: NgTemplateTemplateNode,
    tokenConfigs: createElementLikeTokenConfigs('ng-template'),
  }),
  [TemplateNodeType.NgContainer]: structure => ({
    ctor: NgContainerTemplateNode,
    tokenConfigs: createElementLikeTokenConfigs('ng-container'),
  }),
  [TemplateNodeType.TextAttribute]: structure => ({
    ctor: TextAttributeTemplateNode,
    tokenConfigs: [
      { type: TokenType.TRIVIA, text: ' ' },
      { type: TokenType.ATTR_NAME, text: structure.name },
      { type: TokenType.ATTR_EQUAL, text: '=' },
      !structure.withoutQuotes ? { type: TokenType.ATTR_QUOTE, text: '"' } : null,
      structure.value != null ? { type: TokenType.ATTR_VALUE, text: structure.value } : null,
      !structure.withoutQuotes ? { type: TokenType.ATTR_QUOTE, text: '"' } : null,
    ].filter(tg.isNullish),
  }),
  [TemplateNodeType.BoundAttribute]: structure => ({
    ctor: BoundAttributeTemplateNode,
    tokenConfigs: [
      { type: TokenType.TRIVIA, text: ' ' },
      { type: TokenType.ATTR_NAME, text: structure.usePrefix ? `bind-${structure.name}` : `[${structure.name}]` },
      { type: TokenType.ATTR_EQUAL, text: '=' },
      { type: TokenType.ATTR_QUOTE, text: '"' },
      { type: TokenType.ATTR_VALUE, text: structure.value },
      { type: TokenType.ATTR_QUOTE, text: '"' },
    ],
  }),
  [TemplateNodeType.BoundEvent]: structure => ({
    ctor: BoundEventTemplateNode,
    tokenConfigs: [
      { type: TokenType.TRIVIA, text: ' ' },
      { type: TokenType.ATTR_NAME, text: structure.usePrefix ? `on-${structure.name}` : `(${structure.name})` },
      { type: TokenType.ATTR_EQUAL, text: '=' },
      { type: TokenType.ATTR_QUOTE, text: '"' },
      { type: TokenType.ATTR_VALUE, text: structure.value },
      { type: TokenType.ATTR_QUOTE, text: '"' },
    ],
  }),
  [TemplateNodeType.Reference]: structure => ({
    ctor: ReferenceTemplateNode,
    tokenConfigs: [
      { type: TokenType.TRIVIA, text: ' ' },
      { type: TokenType.ATTR_NAME, text: '#' + structure.name },
    ]
  })
}

export const createNode = <T extends TemplateNodeTypeWithoutRoot> (
  structure: TemplateNodeTypeToTemplateNodeStructureMap[T],
): CreateResult<T> => {
  const fn = templateNodeTypeToCreateMap[structure.type] as any as Create<T> // sigh
  return fn(structure)
}
