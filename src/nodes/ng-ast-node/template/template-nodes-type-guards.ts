import * as tn from './template-nodes'
import * as tg from 'type-guards'

export const is = tg.isInstanceOf(tn.TemplateNode)

export const isText = tg.isInstanceOf(tn.TextTemplateNode)
export const isInterpolation = tg.isInstanceOf(tn.InterpolationTemplateNode)

export const isElementLike = tg.isInstanceOf(tn.ElementLikeTemplateNode)
export const isElement = tg.isInstanceOf(tn.ElementTemplateNode)
export const isNgTemplate = tg.isInstanceOf(tn.NgTemplateTemplateNode)
export const isNgContainer = tg.isInstanceOf(tn.NgContainerTemplateNode)
export const isComment = tg.isInstanceOf(tn.CommentTemplateNode)

export const isRootLevel = tg.fp.or(
  isText,
  isInterpolation,
  isElementLike,
  isComment,
)

export const isTextAttribute = tg.isInstanceOf(tn.TextAttributeTemplateNode)
export const isBoundAttribute = tg.isInstanceOf(tn.BoundAttributeTemplateNode)
export const isBoundEvent = tg.isInstanceOf(tn.BoundEventTemplateNode)
export const isBananaInTheBox = tg.isInstanceOf(tn.BananaInTheBoxTemplateNode)
export const isReference = tg.isInstanceOf(tn.ReferenceTemplateNode)

// region Element

export const isElementWithTagName = (tagName: string) =>
  tg.fp.and(isElement, element => element.hasTagName(tagName))

// endregion Element

// region NgTemplate

export const isNgTemplateWithReferenceName = (referenceName: string) =>
  tg.fp.and(isNgTemplate, ngTemplate => ngTemplate.hasReferenceNamed(referenceName))

// endregion NgTemplate
