import { ClassDeclaration } from 'ts-morph'
import { Component } from './component/component'
import { Project } from '../../project'
import { NgModule } from './ng-module'
import { Directive } from './directive/directive'
import { Pipe } from './pipe/pipe'
import { Declarable } from './declarable'

function isName (name: string) {
  return (namedNode: { getName (): string }) => namedNode.getName() == name
}

export function createDeclarable (project: Project, ngModule: NgModule, classDeclaration: ClassDeclaration): Declarable {
  // TODO: Test if it's already been declared and throw and error in that case.
  // Each declarable can be declared only once.

  const decorators = classDeclaration.getDecorators()

  const componentDecorators = decorators.filter(isName('Component'))
  const directiveDecorators = decorators.filter(isName('Directive'))
  const pipeDecorators = decorators.filter(isName('Pipe'))

  if (componentDecorators.length + directiveDecorators.length + pipeDecorators.length != 1) {
    throw new Error(`Expected exactly one decorator of @Component, @Directive and @Pipe.`)
  }

  if (componentDecorators.length == 1) return new Component(project, ngModule, classDeclaration)
  if (directiveDecorators.length == 1) return new Directive(project, ngModule, classDeclaration)
  if (pipeDecorators.length == 1) return new Pipe(project, ngModule, classDeclaration)

  throw new Error(`Unreachable code.`)
}
