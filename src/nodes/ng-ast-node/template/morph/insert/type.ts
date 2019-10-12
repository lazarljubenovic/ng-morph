import {
  ChildTemplateNodeType,
  ElementLikeTemplateNodeType,
  ParentTemplateNodeType,
  TemplateNodeTypeToTemplateNodeMap,
} from '../../template-nodes-structs'
import { Token } from '../../tokenizer/lexer'

interface InsertionInfo {
  previousToken: Token
}

export interface InsertionRule<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | ChildTemplateNodeType> {

  getInfo (
    origin: TemplateNodeTypeToTemplateNodeMap[TOriginType],
  ): InsertionInfo

  insert (
    origin: TemplateNodeTypeToTemplateNodeMap[TOriginType],
    newNode: TemplateNodeTypeToTemplateNodeMap[TNewNodeType],
  ): void

}
