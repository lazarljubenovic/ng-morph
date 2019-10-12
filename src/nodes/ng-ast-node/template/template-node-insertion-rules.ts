import {
  AttributeLikeTemplateNode,
  ElementLikeTemplateNode,
  ParentTemplateNode,
  TextLikeTemplateNode,
} from './template-nodes'
import { Token } from './tokenizer/lexer'
import {
  AttributeLikeTemplateNodeType,
  ChildTemplateNodeType,
  ElementLikeTemplateNodeType,
  ParentTemplateNodeType, TemplateNodeTypeToTemplateNodeMap,
  TextLikeTemplateNodeType,
} from './template-nodes-structs'

interface InsertionInfo {
  previousToken: Token
}

export interface InsertionRule<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | ChildTemplateNodeType> {

  getInfo (origin: TemplateNodeTypeToTemplateNodeMap[TOriginType]): InsertionInfo

  insert (origin: TemplateNodeTypeToTemplateNodeMap[TOriginType], newNode: TemplateNodeTypeToTemplateNodeMap[TNewNodeType]): void

}

export function firstChild<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | TextLikeTemplateNodeType> (): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) {
      return { previousToken: origin.getTagOpenEndToken() }
    },
    insert (origin, newNode) {
      origin.addChildrenAtIndex([newNode], 0)
    },
  }
}

export function lastChild<TOriginType extends ParentTemplateNodeType, TNewNodeType extends ElementLikeTemplateNodeType | TextLikeTemplateNodeType> (): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) {
      const children = origin.getChildren()
      const childrenCount = children.length
      if (childrenCount > 0) {
        const lastChildIndex = childrenCount - 1
        const lastChild = children[lastChildIndex]
        return { previousToken: lastChild.getLastTokenOrThrow() }
      } else {
        const tagOpenEndToken = origin.getTagOpenEndToken()
        return { previousToken: tagOpenEndToken }
      }
    },
    insert (origin, newNode) {
      const children = origin.getChildren()
      const childrenCount = children.length
      origin.addChildrenAtIndex([newNode], childrenCount)
    },
  }
}

export function firstAttribute<TOriginType extends ParentTemplateNodeType, TNewNodeType extends AttributeLikeTemplateNodeType> (): InsertionRule<TOriginType, TNewNodeType> {
  return {
    getInfo (origin) {
      return { previousToken: origin.getTagOpenStartToken() }
    },
    insert: (origin, newNode) => {
      origin.addAttributesAtIndex([newNode], 0)
    },
  }
}

// export function childAt (index: number): InsertionRule {
//   return {
//     insert: (origin, newNode) => {
//       origin.addChildAtIndex(newNode, index)
//     },
//   }
// }
//
// export function afterChild (child: TemplateNode): InsertionRule {
//   return {
//     insert: (origin, newNode) => {
//       const children = origin.getTemplateChildren()
//       const index = children.indexOf(child)
//       if (index == -1) throw new Error(`Cannot insert after child because child is not found.`)
//       origin.addChildAtIndex(newNode, index + 1)
//     },
//   }
// }
//
// export function beforeChild (child: TemplateNode): InsertionRule {
//   return {
//     insert: (origin, newNode) => {
//       const children = origin.getTemplateChildren()
//       const index = children.indexOf(child)
//       if (index == -1) throw new Error(`Cannot insert before child because child is not found.`)
//       origin.addChildAtIndex(newNode, index)
//     },
//   }
// }
//
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
