import {
  ElementTemplateNode,
  InterpolationTemplateNode,
  NewTokenConfig,
  NgContainerTemplateNode,
  NgTemplateTemplateNode,
  TemplateNodeConstructor,
  TextTemplateNode,
} from './template-nodes'
import { TokenType } from './tokenizer/lexer'

export enum TemplateNodeType {
  Root,
  Text,
  Interpolation,
  Element,
  NgTemplate,
  NgContainer,
}

export type TemplateNodeTypeWithoutRoot = Exclude<TemplateNodeType, TemplateNodeType.Root>

export type TemplateNodeType_Child =
  | TemplateNodeType.Text
  | TemplateNodeType.Interpolation

export type TemplateNodeType_Parent =
  | TemplateNodeType.Root
  | TemplateNodeType.Element
  | TemplateNodeType.NgContainer
  | TemplateNodeType.NgTemplate

export interface TemplateNodeTypeToTemplateNodeStructureMap {
  [TemplateNodeType.Text]: TextTemplateNodeStructure
  [TemplateNodeType.Interpolation]: InterpolationTemplateNodeStructure
  [TemplateNodeType.Element]: ElementTemplateNodeStructure
  [TemplateNodeType.NgTemplate]: NgTemplateTemplateNodeStructure
  [TemplateNodeType.NgContainer]: NgContainerTemplateNodeStructure
}

type TemplateNodeStructure =
  | TextTemplateNodeStructure
  | InterpolationTemplateNodeStructure
  | ElementTemplateNodeStructure
  | NgTemplateTemplateNodeStructure
  | NgContainerTemplateNodeStructure

export interface TemplateNodeTypeToTemplateNodeMap {
  [TemplateNodeType.Text]: TextTemplateNode
  [TemplateNodeType.Interpolation]: InterpolationTemplateNode
  [TemplateNodeType.Element]: ElementTemplateNode
  [TemplateNodeType.NgTemplate]: NgTemplateTemplateNode
  [TemplateNodeType.NgContainer]: NgContainerTemplateNode
}

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

interface ElementLike<T extends TemplateNodeType> extends StructureBase<T> {
  // attributes: any // TODO
  // children: Array<ElementChildren>
}

export interface ElementTemplateNodeStructure extends ElementLike<TemplateNodeType.Element> {
  tagName: string
}

export interface NgTemplateTemplateNodeStructure extends ElementLike<TemplateNodeType.NgTemplate> {
}

export interface NgContainerTemplateNodeStructure extends ElementLike<TemplateNodeType.NgContainer> {
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
  [TemplateNodeType.Text]: (structure) => ({
    ctor: TextTemplateNode,
    tokenConfigs: [
      { type: TokenType.TEXT, text: structure.text },
    ],
  }),
  [TemplateNodeType.Interpolation]: (structure) => ({
    ctor: InterpolationTemplateNode,
    tokenConfigs: [
      { type: TokenType.TEXT, text: structure.text },
    ],
  }),
  [TemplateNodeType.Element]: (structure) => ({
    ctor: ElementTemplateNode,
    tokenConfigs: createElementLikeTokenConfigs(structure.tagName),
  }),
  [TemplateNodeType.NgTemplate]: (structure) => ({
    ctor: NgTemplateTemplateNode,
    tokenConfigs: createElementLikeTokenConfigs('ng-template'),
  }),
  [TemplateNodeType.NgContainer]: (structure) => ({
    ctor: NgContainerTemplateNode,
    tokenConfigs: createElementLikeTokenConfigs('ng-container'),
  }),
}

export const createNode = <T extends TemplateNodeTypeWithoutRoot> (
  structure: TemplateNodeTypeToTemplateNodeStructureMap[T],
): CreateResult<T> => {
  const fn: Create<T> = templateNodeTypeToCreateMap[structure.type] as any // todo oneof
  return fn(structure)
}
