import { AttributeLikeTemplateNodeType, ElementLikeTemplateNodeType } from '../../template-nodes-structs'
import { InsertionRule } from './type'
import { isBetweenInclusive } from '../../../../../utils'

export function at<TOriginType extends ElementLikeTemplateNodeType, TNewNodeType extends AttributeLikeTemplateNodeType> (index: number): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) {
      const attributes = origin.getAttributes()
      const lo = 0
      const hi = attributes.length  // we allow length in order to add as the new last child
      const isValidIndex = isBetweenInclusive(lo, hi)
      if (!isValidIndex(index)) {
        throw new Error(`Cannot insert attribute at index ${index}. The index must be between ${lo} and ${hi}, ` +
          `since the origin node has ${attributes.length} attributes.`)
      }
      if (index == 0) {
        const tagOpenStartToken = origin.getTagOpenStartToken()
        return { previousToken: tagOpenStartToken }
      } else {
        const previousChildIndex = index - 1
        const previousChild = attributes[previousChildIndex]
        return { previousToken: previousChild.getLastTokenOrThrow() }
      }
    },
    insert (origin, newNode) {
      origin.addChildrenAtIndex([newNode], index)
    },
  }
}

export function asFirst<TOriginType extends ElementLikeTemplateNodeType, TNewNodeType extends AttributeLikeTemplateNodeType> (): InsertionRule<TOriginType, TNewNodeType> {
  return at(0)
}

export function asLast<TOriginType extends ElementLikeTemplateNodeType, TNewNodeType extends AttributeLikeTemplateNodeType> (): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) { return at(origin.getAttributes().length).getInfo(origin) },
    insert (origin, newNode) { return at(origin.getAttributes().length).insert(origin, newNode) },
  }
}
