import { Project } from '../../../project'
import * as angularCompiler from '@angular/compiler'
import {
  BoundAttributeTemplateNode,
  BoundEventTemplateNode,
  ElementTemplateNode, InterpolationTemplateNode, NgContainerTemplateNode, NgTemplateTemplateNode, TemplateNode,
  TextAttributeTemplateNode, TextTemplateNode,
} from './template-nodes'
import * as tg from 'type-guards'

interface NgAstNodeWithAttributesInputsOutputsChildren {
  attributes: angularCompiler.TmplAstTextAttribute[]
  inputs: angularCompiler.TmplAstBoundAttribute[]
  outputs: angularCompiler.TmplAstBoundEvent[]
  children: angularCompiler.TmplAstNode[]
}

function transformAttributesInputsOutputsChildren (project: Project, ngNode: NgAstNodeWithAttributesInputsOutputsChildren) {
  const attributes = ngNode.attributes.map(node => fromTextAttribute(project, node))
  const inputs = ngNode.inputs.map(node => fromBoundAttribute(project, node))
  const outputs = ngNode.outputs.map(node => fromBoundEvent(project, node))
  const children = ngNode.children.map(node => fromNgNode(project, node))
  return { attributes, inputs, outputs, children }
}

export function fromElement (project: Project, tmplAstNode: angularCompiler.TmplAstElement): ElementTemplateNode | NgContainerTemplateNode {
  const tagName = tmplAstNode.name
  const { attributes, inputs, outputs, children } = transformAttributesInputsOutputsChildren(project, tmplAstNode)
  if (tagName == 'ng-container') {
    return new NgContainerTemplateNode(project, attributes, inputs, outputs, children)
  } else {
    return new ElementTemplateNode(project, tagName, attributes, inputs, outputs, children)
  }
}

export function fromTemplate (project: Project, tmplAstNode: angularCompiler.TmplAstTemplate): NgTemplateTemplateNode{
  const { attributes, inputs, outputs, children } = transformAttributesInputsOutputsChildren(project, tmplAstNode)
  return new NgTemplateTemplateNode(project, attributes, inputs, outputs, children)
}

export function fromTextAttribute (project: Project, tmplNode: angularCompiler.TmplAstTextAttribute): TextAttributeTemplateNode {
  const name = tmplNode.name
  const value = tmplNode.value
  return new TextAttributeTemplateNode(project, name, value)
}

export function fromBoundAttribute (project: Project, tmplNode: angularCompiler.TmplAstBoundAttribute): BoundAttributeTemplateNode {
  const name = tmplNode.name
  const value = tmplNode.value.toString()
  return new BoundAttributeTemplateNode(project, name, value)
}

export function fromBoundEvent (project: Project, tmplNode: angularCompiler.TmplAstBoundEvent): BoundEventTemplateNode {
  const name = tmplNode.name
  const handler = tmplNode.handler.toString()
  return new BoundEventTemplateNode(project, name, handler)
}

export function fromBoundText (project: Project, tmplAstNode: angularCompiler.TmplAstBoundText): InterpolationTemplateNode {
  const text = tmplAstNode.value.toString()
  return new InterpolationTemplateNode(project, text)
}

export function fromText (project: Project, tmplAstNode: angularCompiler.TmplAstText): TextTemplateNode {
  const text = tmplAstNode.value
  return new TextTemplateNode(project, text)
}

export function fromNgNode (project: Project, ngNode: angularCompiler.TmplAstNode): TemplateNode {
  if (tg.isInstanceOf(angularCompiler.TmplAstText)(ngNode)) return fromText(project, ngNode)
  if (tg.isInstanceOf(angularCompiler.TmplAstBoundText)(ngNode)) return fromBoundText(project, ngNode)

  if (tg.isInstanceOf(angularCompiler.TmplAstElement)(ngNode)) return fromElement(project, ngNode)
  if (tg.isInstanceOf(angularCompiler.TmplAstTemplate)(ngNode)) return fromTemplate(project, ngNode)

  if (tg.isInstanceOf(angularCompiler.TmplAstTextAttribute)(ngNode)) return fromTextAttribute(project, ngNode)
  if (tg.isInstanceOf(angularCompiler.TmplAstBoundAttribute)(ngNode)) return fromBoundAttribute(project, ngNode)
  if (tg.isInstanceOf(angularCompiler.TmplAstBoundEvent)(ngNode)) return fromBoundEvent(project, ngNode)

  console.error(ngNode)
  throw new Error(`Not yet implemented.`)
}

