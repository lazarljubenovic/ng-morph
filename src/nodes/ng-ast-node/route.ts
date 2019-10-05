import { NgAstNode } from './ng-ast-node'
import { Component } from './component/component'
import { NgModule } from './ng-module'
import { Project } from '../../project'
import { throwIfUndefined } from '../../utils'
import * as tg from 'type-guards'
import { LocationSpan } from './location'

export abstract class Route extends NgAstNode {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      private path: string) {
    super(project, locationSpan)
  }

  public getPath (): string {
    return this.path
  }

  public abstract getChildren (): Route[]

  public abstract getComponent (): Component | undefined

  public getComponentOrThrow (): Component {
    return throwIfUndefined(this.getComponent(), `Expected route "${this.getPath()}" to have a component.`)
  }

  public print (indentCount: number = 0): string {
    const indent = ''.padStart(indentCount)
    const line = this.printLine()
    const children = this.getChildren().map(childRoute => childRoute.print(indentCount + 2))
    return `${indent}${line}` + (children.length == 0 ? `` : `\n${children.join('\n')}`)
  }

  public abstract printLine (): string

}


export class EagerRoute extends Route {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      path: string,
                      private component: Component | undefined,
                      private children: Route[]) {
    super(project, locationSpan, path)
  }

  public getChildren (): Route[] {
    return this.children
  }

  public getComponent (): Component | undefined {
    return this.component
  }

  public printLine (): string {
    const component = this.getComponent()
    const name = component == null ? `(componentless)` : component.getName()
    return `/${this.getPath()} :: ${name} (Eager)`
  }

}

export class LazyRoute extends Route {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      path: string,
                      private component: Component | undefined,
                      private ngModule: NgModule) {
    super(project, locationSpan, path)
  }

  public getNgModule () {
    return this.ngModule
  }

  public getChildren (): Route[] {
    const routes = this.ngModule.getChildRoutesOrThrow()
    return routes.getRoutes()
  }

  public getComponent (): Component | undefined {
    return this.component
  }

  public printLine (): string {
    const component = this.getComponent()
    const name = component == null ? `(componentless)` : component.getName()
    return `/${this.getPath()} :: ${name} (Lazy: ${this.ngModule.getName()})`
  }

}

export class RedirectRoute extends Route {

  public constructor (project: Project,
                      locationSpan: LocationSpan,
                      path: string,
                      private redirectTo: string,
                      private pathMatch: 'full' | 'prefix') {
    super(project, locationSpan, path)
  }

  public getChildren (): Route[] {
    return []
  }

  public getComponent (): undefined {
    return undefined
  }

  public getRedirectTo (): string {
    return this.redirectTo
  }

  public getPatchMatch (): 'full' | 'prefix' {
    return this.pathMatch
  }

  public printLine (): string {
    const path = this.getPath()
    const from = path == '' ? `(empty)` : path
    return `/${this.getPath()} :: Redirect: ${from} --> ${this.getRedirectTo()} (${this.getPatchMatch()})`
  }

}

export const isEagerRoute = tg.isInstanceOf(EagerRoute)
export const isLazyRoute = tg.isInstanceOf(LazyRoute)
export const isRedirectRoute = tg.isInstanceOf(RedirectRoute)
