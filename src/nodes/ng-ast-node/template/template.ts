import { NgAstNode } from '../ng-ast-node'
import { Project } from '../../../project'
import * as angularCompiler from '@angular/compiler'
import { fromNgNode } from './factory'
import * as tg from 'type-guards'
import * as templateNodeTypeGuards from './template-nodes-type-guards'
import { RootLevelTemplateNode } from './template-nodes'

type AngularTemplateCompilerOutput = ReturnType<typeof angularCompiler.parseTemplate>

export class Template extends NgAstNode {

  public static FromInternalAst (project: Project, angularTemplateCompilerOutput: AngularTemplateCompilerOutput) {
    console.log(angularTemplateCompilerOutput.nodes)
    const roots = angularTemplateCompilerOutput.nodes.map(ngNode => fromNgNode(project, ngNode))
    if (!tg.isArrayOf(templateNodeTypeGuards.isRootLevel)(roots)) {
      throw new Error(`Expected roots to be roots.`)
    }
    return new Template(project, roots)
  }

  public constructor (project: Project,
                      private roots: RootLevelTemplateNode[]) {
    super(project)
  }

  public getRoots () {
    return this.roots
  }

}
