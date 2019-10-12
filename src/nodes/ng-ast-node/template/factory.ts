import { Project } from '../../../project'
import {
  BoundAttributeTemplateNode,
  BoundEventTemplateNode,
  ElementTemplateNode,
  InterpolationTemplateNode,
  NgContainerTemplateNode,
  NgTemplateTemplateNode,
  TemplateNode,
  TextAttributeTemplateNode,
  TextTemplateNode,
} from './template-nodes'
import * as tg from 'type-guards'
import { Template, TemplateConfig } from './template'
import { Attribute, Element, Node, Text } from './tokenizer/ast'

const NG_CONTAINER_TAG_NAME = 'ng-container'
const NG_TEMPLATE_TAG_NAME = 'ng-template'

export function fromText (project: Project,
                          template: Template,
                          templateConfig: TemplateConfig,
                          htmlNode: Text,
): Array<TextTemplateNode | InterpolationTemplateNode> {
  return [new TextTemplateNode(project, htmlNode.tokens, template)]
}

export function fromElement (project: Project,
                             template: Template,
                             templateConfig: TemplateConfig,
                             htmlNode: Element,
): ElementTemplateNode | NgContainerTemplateNode | NgTemplateTemplateNode {
  const { name: tagName, tokens } = htmlNode
  const allAttributes = htmlNode.attrs.map(attrNode => fromAttribute(project, template, templateConfig, attrNode))
  const children = htmlNode.children.flatMap(childNode => fromHtmlNode(project, template, templateConfig, childNode))
  const constructor = tagName == NG_TEMPLATE_TAG_NAME
    ? NgTemplateTemplateNode
    : tagName == NG_CONTAINER_TAG_NAME
      ? NgContainerTemplateNode
      : ElementTemplateNode
  const result = new constructor(project, tokens, template)
  result.addChildrenAtIndex(children, 0)
  result._setAttributes(allAttributes)
  return result
}

export function fromAttribute (project: Project,
                               template: Template,
                               templateConfig: TemplateConfig,
                               htmlNode: Attribute,
): TextAttributeTemplateNode | BoundAttributeTemplateNode | BoundEventTemplateNode {
  const { name, tokens } = htmlNode
  if ((name.startsWith('[') && name.endsWith(']')) || name.startsWith('bind-')) {
    return new BoundAttributeTemplateNode(project, tokens, template)
  }
  if ((name.startsWith('(') && name.endsWith(')')) || name.startsWith('on-')) {
    return new BoundAttributeTemplateNode(project, tokens, template)
  }
  // if ((name.startsWith('[(') && name.endsWith(')]')) || name.startsWith('bindon-')) {
  //   return new BananaInTheBoxTemplateNode(project, tokens, template)
  // }
  // if (name.startsWith('#')) {
  //   return new ReferenceTemplateNode(project, tokens, template)
  // }
  return new TextAttributeTemplateNode(project, tokens, template)
}

// export function fromComment (project: Project,
//                              template: Template,
//                              templateConfig: TemplateConfig,
//                              htmlNode: Comment): CommentTemplateNode {
//   return new CommentTemplateNode(project, htmlNode.tokens, template)
// }

export function fromHtmlNode (project: Project, template: Template, templateConfig: TemplateConfig, htmlNode: Node): Array<TemplateNode> {
  if (tg.isInstanceOf(Text)(htmlNode)) return fromText(project, template, templateConfig, htmlNode)
  if (tg.isInstanceOf(Element)(htmlNode)) return [fromElement(project, template, templateConfig, htmlNode)]
  if (tg.isInstanceOf(Attribute)(htmlNode)) return [fromAttribute(project, template, templateConfig, htmlNode)]
  // if (tg.isInstanceOf(Comment)(htmlNode)) return [fromComment(project, template, templateConfig, htmlNode)]

  console.error(htmlNode)
  throw new Error(`Not yet implemented.`)
}

