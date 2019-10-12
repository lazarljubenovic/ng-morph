import {
  ElementLikeTemplateNodeType,
  ParentTemplateNodeType,
  TemplateNodeTypeToTemplateNodeMap,
  TextLikeTemplateNodeType,
} from '../../template-nodes-structs'
import { isBetweenInclusive } from '../../../../../utils'
import { InsertionRule } from './type'
import * as attribute from './attributes'

export function asChildAt<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | TextLikeTemplateNodeType> (index: number): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) {
      const children = origin.getChildren()
      const lo = 0
      const hi = children.length  // we allow length in order to add as the new last child
      const isValidIndex = isBetweenInclusive(lo, hi)
      if (!isValidIndex(index)) {
        throw new Error(`Cannot at child at index ${index}. The index must be between ${lo} and ${hi}, ` +
          `since the origin node has ${children.length} children.`)
      }
      if (index == 0) {
        const tagOpenEndToken = origin.getTagOpenEndToken()
        return { previousToken: tagOpenEndToken }
      } else {
        const previousChildIndex = index - 1
        const previousChild = children[previousChildIndex]
        return { previousToken: previousChild.getLastTokenOrThrow() }
      }
    },
    insert (origin, newNode) {
      origin.addChildrenAtIndex([newNode], index)
    },
  }
}

export function asFirstChild<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | TextLikeTemplateNodeType> (): InsertionRule<TOriginType, TNewNodeType> {
  return asChildAt(0)
}

export function asLastChild<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | TextLikeTemplateNodeType> (): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) { return asChildAt(origin.getChildren().length).getInfo(origin) },
    insert (origin, newNode) { asChildAt(origin.getChildren().length).insert(origin, newNode) },
  }
}

export function afterChild<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | TextLikeTemplateNodeType> (child: TemplateNodeTypeToTemplateNodeMap[TNewNodeType]): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) {
      const children = origin.getChildren()
      const index = children.indexOf(child)
      if (index == -1) throw new Error(`Cannot insert after child because child is not found.`)
      return asChildAt(index + 1).getInfo(origin)
    },
    insert (origin, newNode) {
      const children = origin.getChildren()
      const index = children.indexOf(child)
      if (index == -1) throw new Error(`Cannot insert after child because child is not found.`)
      asChildAt(index + 1).insert(origin, newNode)
    },
  }
}

export function beforeChild<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | TextLikeTemplateNodeType> (child: TemplateNodeTypeToTemplateNodeMap[TNewNodeType]): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) {
      const children = origin.getChildren()
      const index = children.indexOf(child)
      if (index == -1) throw new Error(`Cannot insert after child because child is not found.`)
      return asChildAt(index).getInfo(origin)
    },
    insert (origin, newNode) {
      const children = origin.getChildren()
      const index = children.indexOf(child)
      if (index == -1) throw new Error(`Cannot insert after child because child is not found.`)
      asChildAt(index).insert(origin, newNode)
    },
  }
}

// export function nextSibling (): InsertionRule {
//   return {
//     insert: (origin, newNode) => {
//       const index = origin.getIndexInParentsChildren()
//       const parent = origin.getTemplateParent()
//       if (parent == null) {
//         // todo
//         throw new Error(`Not implemented.`)
//       } else {
//         parent.addChildAtIndex(newNode, index + 1)
//       }
//     },
//   }
// }
//
// export function previousSibling (): InsertionRule {
//   return {
//     insert: (origin, newNode) => {
//       const index = origin.getIndexInParentsChildren()
//       const parent = origin.getTemplateParent()
//       if (parent == null) {
//         // todo
//         throw new Error(`Not implemented.`)
//       } else {
//         parent.addChildAtIndex(newNode, index)
//       }
//     },
//   }
// }
//
// export function wrapAllChildren (): InsertionRule {
//   return {
//     insert: (origin, newNode) => {
//       const children = origin.getTemplateChildren()
//       for (const child of children) {
//         origin.removeChild(child, { doNotForget: true }) // TODO: Add bulk removal and use it here
//       }
//       origin.addChildAtIndex(newNode, 0)
//       let index = 0
//       for (const child of children) {
//         newNode.addChildAtIndex(child, index++) // TODO: Add bulk insertion and use it here
//       }
//     },
//   }
// }

// region Barrel

export { attribute }

// endregion Barrel
