import { Project } from '../../../project'
import {
  BananaInTheBoxTemplateNode,
  BoundAttributeTemplateNode,
  BoundEventTemplateNode,
  CommentTemplateNode,
  ElementTemplateNode,
  InterpolationTemplateNode,
  NgContainerTemplateNode,
  NgTemplateTemplateNode,
  ReferenceTemplateNode,
  TemplateNode,
  TextAttributeTemplateNode,
  TextTemplateNode,
} from './template-nodes'
import * as tg from 'type-guards'
import { Template, TemplateConfig } from './template'
import { LocationPointer, LocationSpan } from '../location'
import { Attribute, Comment, Element, Node, Text } from './tokenizer/ast'
import { ParseLocation, ParseSourceSpan } from './tokenizer/parse_util'

const NG_CONTAINER_TAG_NAME = 'ng-container'
const NG_TEMPLATE_TAG_NAME = 'ng-template'

export function fromText (project: Project,
                          template: Template,
                          templateConfig: TemplateConfig,
                          htmlNode: Text,
): Array<TextTemplateNode | InterpolationTemplateNode> {
  const text = htmlNode.value
  return [new TextTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, text)]
}

export function fromElement (project: Project,
                             template: Template,
                             templateConfig: TemplateConfig,
                             htmlNode: Element,
): ElementTemplateNode | NgContainerTemplateNode | NgTemplateTemplateNode {
  const tagName = htmlNode.name
  const allAttributes = htmlNode.attrs.map(attrNode => fromAttribute(project, template, templateConfig, attrNode))
  const children = htmlNode.children.flatMap(childNode => fromHtmlNode(project, template, templateConfig, childNode))
  if (tagName == NG_CONTAINER_TAG_NAME) {
    return new NgContainerTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, allAttributes, children)
  } else if (tagName == NG_TEMPLATE_TAG_NAME) {
    return new NgTemplateTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, allAttributes, children)
  } else {
    return new ElementTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, tagName, allAttributes, children)
  }
}

export function fromAttribute (project: Project,
                               template: Template,
                               templateConfig: TemplateConfig,
                               htmlNode: Attribute,
): TextAttributeTemplateNode | BoundAttributeTemplateNode | BoundEventTemplateNode | BananaInTheBoxTemplateNode | ReferenceTemplateNode {
  const { name, value } = htmlNode
  if ((name.startsWith('[') && name.endsWith(']')) || name.startsWith('bind-')) {
    return new BoundAttributeTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, name, value)
  }
  if ((name.startsWith('(') && name.endsWith(')')) || name.startsWith('on-')) {
    return new BoundAttributeTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, name, value)
  }
  if ((name.startsWith('[(') && name.endsWith(')]')) || name.startsWith('bindon-')) {
    return new BananaInTheBoxTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, name, value)
  }
  if (name.startsWith('#')) {
    return new ReferenceTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, name, value)
  }
  return new TextAttributeTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, name, value)
}

export function fromComment (project: Project,
                             template: Template,
                             templateConfig: TemplateConfig,
                             htmlNode: Comment): CommentTemplateNode {
  const value = htmlNode.value
  return new CommentTemplateNode(project, htmlNode.locationSpan, htmlNode.tokens, template, value)
}

export function fromHtmlNode (project: Project, template: Template, templateConfig: TemplateConfig, htmlNode: Node): Array<TemplateNode> {
  if (tg.isInstanceOf(Text)(htmlNode)) return fromText(project, template, templateConfig, htmlNode)
  if (tg.isInstanceOf(Element)(htmlNode)) return [fromElement(project, template, templateConfig, htmlNode)]
  if (tg.isInstanceOf(Attribute)(htmlNode)) return [fromAttribute(project, template, templateConfig, htmlNode)]
  if (tg.isInstanceOf(Comment)(htmlNode)) return [fromComment(project, template, templateConfig, htmlNode)]

  console.error(htmlNode)
  throw new Error(`Not yet implemented.`)
}

