import * as tn from './template-nodes'
import * as tg from 'type-guards'

export const is = tg.isInstanceOf(tn.TemplateNode)

export const isChild = tg.isInstanceOf(tn.ChildTemplateNode)
export const isText = tg.isInstanceOf(tn.TextTemplateNode)
export const isInterpolation = tg.isInstanceOf(tn.InterpolationTemplateNode)

export const isParent = tg.isInstanceOf(tn.ParentTemplateNode)
export const isElement = tg.isInstanceOf(tn.ElementTemplateNode)
export const isNgTemplate = tg.isInstanceOf(tn.NgTemplateTemplateNode)
export const isNgContainer = tg.isInstanceOf(tn.NgContainerTemplateNode)
// export const isComment = tg.isInstanceOf(tn.CommentTemplateNode)

export const isAttribute = tg.isInstanceOf(tn.AttributeTemplateNode)
export const isTextAttribute = tg.isInstanceOf(tn.TextAttributeTemplateNode)
export const isBoundAttribute = tg.isInstanceOf(tn.BoundAttributeTemplateNode)
export const isBoundEvent = tg.isInstanceOf(tn.BoundEventTemplateNode)
// export const isBananaInTheBox = tg.isInstanceOf(tn.BananaInTheBoxTemplateNode)
// export const isReference = tg.isInstanceOf(tn.ReferenceTemplateNode)

// region Element

export const isElementWithTagName = (tagName: string) =>
  tg.fp.and(isElement, element => element.hasTagName(tagName))

// todo: with id, with classes, isComponentSelectorFor(), ...

// endregion Element

// region NgTemplate

// export const isNgTemplateWithReferenceName = (referenceName: string) =>
//   tg.fp.and(isNgTemplate, ngTemplate => ngTemplate.hasReferenceNamed(referenceName))

// endregion NgTemplate

// region Attribute

export const isTextAttributeWithName = (attributeName: string) =>
  tg.fp.and(isTextAttribute, attribute => attribute.getName() == attributeName)

export const isTextAttributeWithValue = (attributeValue: string) =>
  tg.fp.and(isTextAttribute, attribute => attribute.getValue() == attributeValue)

// endregion Attribute
