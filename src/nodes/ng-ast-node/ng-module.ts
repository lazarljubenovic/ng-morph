import { Declarable } from './declarable'
import { NgAstNode } from './ng-ast-node'
import { Component } from './component/component'
import * as tg from 'type-guards'
import { Directive } from './directive/directive'
import { Pipe } from './pipe/pipe'
import * as tsm from 'ts-morph'
import { SyntaxKind } from 'ts-morph'
import { Project } from '../../project'
import { resolveArrayDestructing } from '../../utils/array-destructing-resolver'
import {
  getFirstElementOrThrow,
  getPropertyValueOfKind,
  getPropertyValueOfKindOrThrow,
  throwIfLengthNotOne,
  throwIfUndefined,
} from '../../utils'
import { resolveTo } from '../../utils/resolve-to'
import * as path from 'path'
import { EagerRoute, LazyRoute, RedirectRoute, Route } from './route'
import { Routes } from './routes'
import { LocationSpan } from './location'

function getArrayElementsFromObjectLiteralPropertyInitializer (object: tsm.ObjectLiteralExpression, propertyName: string): tsm.Node[] {
  const objectLiteralElementLike = object.getProperty(propertyName)
  if (objectLiteralElementLike == null) return []
  if (!tsm.TypeGuards.isPropertyAssignment(objectLiteralElementLike)) throw new Error(`Expected @NgModule.imports to be a property assignment.`)
  const initializer = objectLiteralElementLike.getInitializer()
  if (initializer == null || !tsm.TypeGuards.isArrayLiteralExpression(initializer)) throw new Error(`Expected @NgModule.imports to be initialized with an array literal expresion.`)
  return resolveArrayDestructing(initializer)
}

function getClassDeclarationFromLoadChildrenArrowFunction (project: Project, arrowFunction: tsm.ArrowFunction): tsm.ClassDeclaration {
  const innerArrowFunction = arrowFunction.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction)
  const propAccess = innerArrowFunction.getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression)
  const classDeclarationReference = propAccess.getLastChildIfKindOrThrow(SyntaxKind.Identifier)
  const definitions = classDeclarationReference.getDefinitionNodes()
  const definition = definitions.find(tsm.TypeGuards.isClassDeclaration)
  return throwIfUndefined(definition, `Expected "loadChildren" to point to a class declaration: "${arrowFunction.getText()}".`)
}

function readRoutingInfoFromExpression (project: Project, callExpression: tsm.Expression): { routes: Route[], isForRoot: boolean, isForChild: boolean } {
  if (!tsm.TypeGuards.isCallExpression(callExpression)) {
    const text = callExpression.getText()
    const kind = callExpression.getKindName()
    throw new Error(`Routing info must be read from a CallExpression, such as "RoutingModule.forRoot(routes)". Instead got "${text}" (which is a ${kind}).`)
  }

  const left = callExpression.getExpression()
  if (!tsm.TypeGuards.isPropertyAccessExpression(left)) throw new Error(`Expected a PropertyAccessExpression`)
  const methodName = left.getNameNode()
  if (!tsm.TypeGuards.isIdentifier(methodName)) throw new Error(`Expected an Identifier.`)
  const isForRoot = methodName.getText() == 'forRoot' // todo: test this against a reference
  const isForChild = methodName.getText() == 'forChild' // todo: test this against a reference

  const args = callExpression.getArguments()
  const arg = getFirstElementOrThrow(args, `Expected at least a single argument in ${callExpression.getText()}.`)
  const arrayLiteralExpression = resolveTo(arg, SyntaxKind.ArrayLiteralExpression)

  return {
    routes: readRoutingInfoFromArrayLiteralExpression(project, arrayLiteralExpression),
    isForRoot,
    isForChild,
  }
}

function readRoutingInfoFromArrayLiteralExpression (project: Project, arrayLiteral: tsm.ArrayLiteralExpression): Route[] {
  return arrayLiteral.getElements().map(element => {
    if (!tsm.TypeGuards.isObjectLiteralExpression(element)) {
      throw new Error(`Expected all elements in route definition to be object literals. Instead got ${element.getKindName()}.`)
    }

    const locationSpan = LocationSpan.FromTsm(element)

    const pathProperty = getPropertyValueOfKindOrThrow(element, 'path', SyntaxKind.StringLiteral)
    const path = pathProperty.getLiteralValue()

    const loadChildrenArrowFunction = getPropertyValueOfKind(element, 'loadChildren', SyntaxKind.ArrowFunction)
    const redirectToStringLiteral = getPropertyValueOfKind(element, 'redirectTo', SyntaxKind.StringLiteral)

    if (loadChildrenArrowFunction != null) {
      const ngModuleClassDeclaration = getClassDeclarationFromLoadChildrenArrowFunction(project, loadChildrenArrowFunction)
      const ngModule = project.registerNgModuleOrIgnore(new NgModule(project, ngModuleClassDeclaration))
      return new LazyRoute(project, locationSpan, path, undefined, ngModule) // TODO: Read component
    } else if (redirectToStringLiteral != null) {
      const pathMatch: string = getPropertyValueOfKindOrThrow(element, 'pathMatch', SyntaxKind.StringLiteral).getLiteralValue()
      if (!tg.isEnum('prefix' as const, 'full' as const)(pathMatch)) {
        throw new Error(`Expected "prefix" or "full" for "pathMatch", but got "${pathMatch}".`)
      }
      const redirectTo = redirectToStringLiteral.getLiteralValue()
      return new RedirectRoute(project, locationSpan, path, redirectTo, pathMatch)
    } else {
      const childrenArrayLiteral = getPropertyValueOfKind(element, 'children', SyntaxKind.ArrayLiteralExpression)
      const componentClassDeclaration = getPropertyValueOfKind(element, 'component', SyntaxKind.ClassDeclaration)
      const ngModule = componentClassDeclaration == null ? undefined : project.getNgModuleWhereDeclared(componentClassDeclaration)
      const component = componentClassDeclaration == null ? undefined : new Component(project, ngModule!, componentClassDeclaration)
      const children = childrenArrayLiteral == null ? [] : readRoutingInfoFromArrayLiteralExpression(project, childrenArrayLiteral!)
      return new EagerRoute(project, locationSpan, path, component, children)
    }
  })
}

function resolveAsDeveloperDefinedClass (project: Project, ngModuleAstNode: NgModule, classDeclaration: tsm.ClassDeclaration) {
  const declarable: Declarable[] = []
  const directImports: NgModule[] = []
  const exports: Array<NgModule | Declarable> = []
  const routeDefinitions: Route[] = []
  let isForRoot: boolean = false
  let isForChild: boolean = false

  const decorator = classDeclaration.getDecorator('NgModule')
  if (decorator == null) {
    const className = classDeclaration.getName() || '[Unnamed class]'
    const filePath = classDeclaration.getSourceFile().getFilePath()
    throw new Error(`Expected class declaration for ${className} in ${filePath} to have decorator @NgModule.`)
  }
  const decoratorArguments = decorator.getArguments()
  if (decoratorArguments.length != 1) throw new Error(`Expected @NgModule to to have a single argument.`)
  const [object] = decoratorArguments
  if (!tsm.TypeGuards.isObjectLiteralExpression(object)) throw new Error(`Expected the first argument of @NgModule to be an object literal.`)

  const declarationElements = getArrayElementsFromObjectLiteralPropertyInitializer(object, 'declarations')
  for (const element of declarationElements) {
    if (!tsm.TypeGuards.isIdentifier(element)) {
      throw new Error(`Expected all elements in @NgModule.declarations array to be identifiers, found: ${element.getText()}.`)
    }
    const elementDefinitions = element.getDefinitionNodes()
    const classDeclaration = elementDefinitions.find(tsm.TypeGuards.isClassDeclaration)
    if (classDeclaration == null) throw new Error(`All elements of @NgModule.declarations are expected to reference a class.`)
    const newDeclarable = project.registerDeclarable(classDeclaration, ngModuleAstNode)
    declarable.push(newDeclarable)
  }

  const importElements = getArrayElementsFromObjectLiteralPropertyInitializer(object, 'imports')
  for (const element of importElements) {
    let elementDefinitions: tsm.Node[]
    let isCallExpression: boolean = false
    if (tsm.TypeGuards.isIdentifier(element)) {
      elementDefinitions = element.getDefinitionNodes()
    } else if (tsm.TypeGuards.isCallExpression(element)) {
      isCallExpression = true
      const propertyAccessExpression = element.getExpression()
      if (!tsm.TypeGuards.isPropertyAccessExpression(propertyAccessExpression)) throw new Error(`Expected expression in ${element.getText()} to be a property access expression.`)
      const identifier = propertyAccessExpression.getExpression()
      if (!tsm.TypeGuards.isIdentifier(identifier)) throw new Error(`Expected an identifier on the left of ${element.getText()}.`)
      elementDefinitions = identifier.getDefinitionNodes()
    } else {
      throw new Error(`Expected all elements in @NgModule.imports to be identifiers or function calls, found: ${element.getText()}.`)
    }
    const classDeclaration = elementDefinitions.find(tsm.TypeGuards.isClassDeclaration)
    if (classDeclaration == null) {
      const kindNames = elementDefinitions.map(def => def.getKindName())
      const text = element.getText()
      const length = kindNames.length
      const kindNamesString = kindNames.join(', ')
      let message = `@NgModule.imports found to contain ${text}, which has ${length} definitions: ${kindNamesString}. `
        + `All elements of @NgModule.imports are expected to be defined as ClassDeclaration.`
      console.error(message)
      continue
      // throw new Error(message)
    }

    if (isCallExpression && project.isClassDeclarationForRouterModule(classDeclaration)) {
      const routeDefinition = readRoutingInfoFromExpression(project, element)
      isForRoot = routeDefinition.isForRoot
      isForChild = routeDefinition.isForChild
      routeDefinitions.push(...routeDefinition.routes)
    }

    const existingNgModule = project.getNgModuleByClassDeclaration(classDeclaration)
    if (existingNgModule == null) {
      const newNgModule = new NgModule(project, classDeclaration)
      project.registerNgModuleButThrowIfRegistered(newNgModule)
      directImports.push(newNgModule)
    } else {
      directImports.push(existingNgModule)
    }
  }

  const exportElements = getArrayElementsFromObjectLiteralPropertyInitializer(object, 'exports')
  for (const element of exportElements) {
    if (!tsm.TypeGuards.isIdentifier(element)) {
      throw new Error(`Expected all elements in @NgModule.exports array to be identifiers, found: ${element.getText()}.`)
    }
    const elementDefinitions = element.getDefinitionNodes()
    const classDeclaration = elementDefinitions.find(tsm.TypeGuards.isClassDeclaration)
    if (classDeclaration == null) {
      const definitionNames = elementDefinitions.map(def => `"${def.getText()}" (a ${def.getKindName()})`).join(', ')
      throw new Error(`All elements of @NgModule.exports are expected to reference a class. Instead got ${definitionNames}.`)
    }
    const alreadyRegisteredNgModule = project.getNgModuleByClassDeclaration(classDeclaration)
    const alreadyDeclaredDeclarable = project.getDeclarableByClassDeclaration(classDeclaration)
    if (alreadyRegisteredNgModule != null) {
      exports.push(alreadyRegisteredNgModule)
    } else if (alreadyDeclaredDeclarable != null) {
      exports.push(alreadyDeclaredDeclarable)
    } else {
      throw new Error(`Expected ${classDeclaration.getName()} to have already been registered as either a declarable or a module.`)
    }
  }

  return {
    declarable,
    directImports,
    exports,
    routeDefinitions,
    isForRoot,
    isForChild,
  }
}


export class NgModule extends NgAstNode {

  protected readonly directImports: NgModule[]

  protected readonly exports: Array<Declarable | NgModule>

  protected readonly declarable: Declarable[]

  protected readonly routes?: Routes

  public constructor (project: Project,
                      protected classDeclaration: tsm.ClassDeclaration) {
    super(project, LocationSpan.FromTsm(classDeclaration))

    const filePath = classDeclaration.getSourceFile().getFilePath()
    if (filePath.includes('/node_modules/')) {
      console.warn(`Ignoring ${classDeclaration.getName()} in ${filePath} for now; this is external...`)
      this.directImports = []
      this.exports = []
      this.declarable = []
    } else {
      const results = resolveAsDeveloperDefinedClass(project, this, classDeclaration)
      this.directImports = results.directImports
      this.exports = results.exports
      this.declarable = results.declarable
      this.routes = new Routes(project, this.getLocationSpan(), results.isForRoot, results.isForChild, results.routeDefinitions)
    }
  }

  public getRoutes () {
    if (this.routes != null) {
      return this.routes
    }
  }

  public getClassDeclaration (): tsm.ClassDeclaration {
    return this.classDeclaration
  }

  public getName (): string {
    return this.getClassDeclaration().getNameOrThrow()
  }

  public getDirectDeclarations (): Declarable[] {
    return this.declarable
  }

  public getComponents (): Component[] {
    return this.getDirectDeclarations().filter(tg.isInstanceOf(Component))
  }

  public getComponent (selector: (component: Component) => boolean): Component | undefined {
    const components = this.getComponents()
    return components.find(selector)
  }

  public getComponentOrThrow (selector: (component: Component) => boolean): Component {
    return throwIfUndefined(this.getComponent(selector), `Expected to find a component in NgModule "${this.getName()}".`)
  }

  public getComponentByClassName (className: string): Component | undefined {
    return this.getComponent(component => component.getName() == className)
  }

  public getComponentByClassNameOrThrow (className: string): Component {
    return throwIfUndefined(this.getComponentByClassName(className), `Expected to find a component with class name "${className}" in NgModule "${this.getName()}".`)
  }

  public getComponentBySelectorDefinition (selectorDefinition: string): Component | undefined {
    return this.getComponent(component => component.getSelectorDefinition() == selectorDefinition)
  }

  public getComponentBySelectorDefinitionOrThrow (selectorDefinition: string): Component {
    return throwIfUndefined(this.getComponentBySelectorDefinition(selectorDefinition), `Expected to find a component with selector definition "${selectorDefinition}" in NgModule "${this.getName()}".`)
  }

  public getDirectives (): Directive[] {
    return this.getDirectDeclarations().filter(tg.isInstanceOf(Directive))
  }

  public getPipes (): Pipe[] {
    return this.getDirectDeclarations().filter(tg.isInstanceOf(Pipe))
  }

  public getDirectlyImportedModules (): NgModule[] {
    return this.directImports
  }

  public getDirectlyExportedModules (): NgModule[] {
    return this.exports.filter(tg.isInstanceOf(NgModule))
  }

  public getDirectlyExportedDeclarables (): Declarable[] {
    return this.exports.filter(tg.isInstanceOf(Declarable))
  }

  public getNgModulesInScope (): NgModule[] {
    const result = new Set<NgModule>()

    const visited = new Set<NgModule>()
    const queue: NgModule[] = [...this.getDirectlyImportedModules()]

    while (queue.length > 0) {
      const currentNgModule = queue.shift()!
      result.add(currentNgModule)
      const currentModuleDirectExports = currentNgModule.getDirectlyExportedModules()
      for (const innerModule of currentModuleDirectExports) {
        if (visited.has(innerModule)) continue
        queue.push(innerModule)
      }
    }

    return [...result]
  }

  public getDeclarablesInScope (): Declarable[] {
    const result = new Set<Declarable>()
    for (const ngModule of this.getNgModulesInScope()) {
      for (const declarable of ngModule.getDirectDeclarations()) {
        result.add(declarable)
      }
    }
    return [...result]
  }

  public getRootRoutes (): Routes | undefined {
    for (const ngModule of this.getNgModulesInScope()) {
      const routes = ngModule.getRoutes()
      if (routes != null) {
        if (routes.isForRoot()) {
          return routes
        }
      }
    }
    return undefined
  }

  public getRootRoutesOrThrow (): Routes {
    return throwIfUndefined(this.getRootRoutes(), `Expected to find root routes visible from ${this.getName()}.`)
  }

  public getChildRoutes (): Routes | undefined {
    for (const ngModule of this.getNgModulesInScope()) {
      const routes = ngModule.getRoutes()
      if (routes != null) {
        if (routes.isForChild()) {
          console.log(`for`, this.getName(), `found in`, ngModule.getName())
          return routes
        }
      }
    }
    return undefined
  }

  public getChildRoutesOrThrow (): Routes {
    return throwIfUndefined(this.getChildRoutes(), `Expected to find child routes visible from ${this.getName()}.`)
  }

}

