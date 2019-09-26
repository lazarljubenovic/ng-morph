import { NgAstNode } from '../ng-ast-node'
import { Project } from '../../../project'

export abstract class External extends NgAstNode {

  constructor (project: Project,
               protected moduleName: string,
               protected symbolName: string) {
    super(project)
  }

  public getModuleName () {
    return this.moduleName
  }

  protected getName () {
    return this.symbolName
  }

}

export class ExternalNgModule extends External {
}

export class ExternalComponent extends External {
}

export class ExternalDirective extends External {
}

export class ExternalPipe extends External {
}
