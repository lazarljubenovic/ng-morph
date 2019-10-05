import { NgAstNode } from './ng-ast-node'
import { Project } from '../../project'
import { Route } from './route'
import { LocationSpan } from './location'

export class Routes extends NgAstNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      private _isForRoot: boolean,
                      private _isForChild: boolean,
                      private routes: Route[]) {
    super(project, locationSpan)
  }

  public isForRoot () {
    return this._isForRoot
  }

  public isForChild () {
    return this._isForChild
  }

  public getRoutes () {
    return this.routes
  }

  public print () {
    return this.routes.map(route => route.print(0)).join('\n')
  }

}
