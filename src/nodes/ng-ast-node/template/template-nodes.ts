import { NgAstNode } from '../ng-ast-node'
import * as angularCompiler from '@angular/compiler'
import { Project } from '../../../project'

export abstract class TemplateNode extends NgAstNode {

  // TODO: Add source file position of node

  protected constructor (project: Project) {
    super(project)
  }

  public abstract getTemplateChildren (): TemplateNode[]

}


// region Text and interpolation

export class TextTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      protected text: string) {
    super(project)
  }

  public getText (): string {
    return this.text
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class InterpolationTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      protected text: string) {
    super(project)
  }

  public getText (): string {
    return this.text
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

// endregion Text and interpolation

// region Elements, ng-template and ng-container

export abstract class ElementLikeTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      protected attributes: TextAttributeTemplateNode[],
                      protected inputs: BoundAttributeTemplateNode[],
                      protected outputs: BoundEventTemplateNode[],
                      protected children: TemplateNode[]) {
    super(project)
  }

  public abstract getTagName (): string

  public getAttributes () {
    return this.attributes
  }

  public getInputs () {
    return this.inputs
  }

  public getOutputs () {
    return this.outputs
  }

  public getTemplateChildren (): TemplateNode[] {
    return this.children
  }

}


export class ElementTemplateNode extends ElementLikeTemplateNode {

  public constructor (project: Project,
                      protected tagName: string,
                      attributes: TextAttributeTemplateNode[],
                      inputs: BoundAttributeTemplateNode[],
                      outputs: BoundEventTemplateNode[],
                      children: TemplateNode[]) {
    super(project, attributes, inputs, outputs, children)
  }

  public getText (): string {
    throw new Error(`Not implemented.`)
  }

  public getTagName (): string {
    return this.tagName
  }

}

export class NgTemplateTemplateNode extends ElementLikeTemplateNode {

  public getTagName (): string {
    return `ng-template`
  }

}

export class NgContainerTemplateNode extends ElementLikeTemplateNode {

  public getTagName (): string {
    return `ng-container`
  }

}

export type RootLevelTemplateNode =
  TextTemplateNode |
  InterpolationTemplateNode |
  ElementTemplateNode |
  NgTemplateTemplateNode |
  NgContainerTemplateNode

// endregion Elements, ng-template and ng-container

// region Attributes (text attributes, inputs, outputs)

export class TextAttributeTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      protected name: string,
                      protected value: string) {
    super(project)
  }

  public getName (): string {
    return this.name
  }

  public getValue (): string {
    return this.value
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class BoundAttributeTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      protected name: string,
                      protected value: string) {
    super(project)
  }

  public getName (): string {
    return this.name
  }

  public getValue (): string {
    return this.value
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class BoundEventTemplateNode extends TemplateNode {

  public constructor (project: Project,
                      protected name: string,
                      protected handler: string) {
    super(project)
  }

  public getName (): string {
    return this.name
  }

  public getHandler (): string {
    return this.handler
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

// endregion Attributes (text attributes, inputs, outputs)

export abstract class BindingTargetTemplateNode extends TemplateNode {
}

export class PropertyBindingTargetTemplateNode extends BindingTargetTemplateNode {

  public constructor (project: Project,
                      protected text: string,
                      protected name: string) {
    super(project)
  }

  public getText (): string {
    return this.text
  }

  public getName (): string {
    return this.name
  }

  // public isBare (): boolean {
  //
  // }
  //
  // public isWithBrackets (): boolean {
  //
  // }
  //
  // public isWithBindPrefix (): boolean {
  //
  // }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class EventBindingTargetTemplateNode extends BindingTargetTemplateNode {

  public constructor (project: Project,
                      protected text: string,
                      protected name: string) {
    super(project)
  }

  public getText (): string {
    return this.text
  }

  public getName (): string {
    return this.name
  }

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class ExpressionTemplateNode extends TemplateNode {

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}

export class StatementTemplateNode extends TemplateNode {

  public getTemplateChildren (): TemplateNode[] {
    return []
  }

}
