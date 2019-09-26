import * as tn from './template-nodes'
import * as tg from 'type-guards'

export const is = tg.isInstanceOf(tn.TemplateNode)

export const isText = tg.isInstanceOf(tn.TextTemplateNode)
export const isInterpolation = tg.isInstanceOf(tn.InterpolationTemplateNode)

export const isElementLike = tg.isInstanceOf(tn.ElementLikeTemplateNode)
export const isElement = tg.isInstanceOf(tn.ElementTemplateNode)
export const isNgTemplate = tg.isInstanceOf(tn.NgTemplateTemplateNode)
export const isNgContainer = tg.isInstanceOf(tn.NgContainerTemplateNode)

export const isRootLevel = tg.fp.or(
  isText,
  isInterpolation,
  isElementLike,
)

export const isTextAttribute = tg.isInstanceOf(tn.TextAttributeTemplateNode)
export const isBoundAttribute = tg.isInstanceOf(tn.BoundAttributeTemplateNode)
export const isBoundEvent = tg.isInstanceOf(tn.BoundEventTemplateNode)
