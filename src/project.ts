import * as tsMorph from 'ts-morph'
import { ClassDeclaration, SyntaxKind, TypeGuards } from 'ts-morph'
import { NgModule } from './nodes/ng-ast-node/ng-module'
import { flatMap, throwIfLengthNotOne, throwIfUndefined } from './utils'
import { Component } from './nodes/ng-ast-node/component/component'
import * as path from 'path'
import { Declarable } from './nodes/ng-ast-node/declarable'
import { createDeclarable } from './nodes/ng-ast-node/declarable-factory'
import { Routes } from './nodes/ng-ast-node/routes'
import { LocationFileManager } from './nodes/ng-ast-node/location'

export interface Singletons {
  readonly locationFileManager: LocationFileManager
}

const defaultSingletons: Singletons = {
  locationFileManager: new LocationFileManager()
}


export class Project {

  private bootstrapModule!: NgModule

  private registeredNgModules: NgModule[] = []

  private allDeclarables: Declarable[] = []

  private builtInNgModules: NgModule[] = []

  public isClassDeclarationForRouterModule (classDeclaration: ClassDeclaration): boolean {
    const routerModule = this.getRouterModule()
    if (routerModule == null) return false
    return routerModule.getClassDeclaration() == classDeclaration
  }

  public getRouterModule (): NgModule | undefined {
    return this.builtInNgModules.find(ngModule => ngModule.getName() == 'RouterModule')
  }

  public getRouterModuleOrThrow (): NgModule {
    return throwIfUndefined(this.getRouterModule())
  }

  constructor (public readonly tsMorphProject: tsMorph.Project,
               public readonly singletons: Singletons = defaultSingletons) {
    this.setUpBuiltInNgModules()
    this.setUp()
  }

  public getBootstrapModule (): NgModule {
    return this.bootstrapModule
  }

  public getNgModules (): NgModule[] {
    return this.registeredNgModules
  }

  public getNgModuleByClassName (name: string): NgModule | undefined {
    return this.getNgModules().find(module => module.getName() == name)
  }

  public getNgModuleByClassNameOrThrow (className: string): NgModule {
    return throwIfUndefined(this.getNgModuleByClassName(className), `Expected to find an NgModule with class name "${className}".`)
  }

  public getNgModuleWhereDeclared (classDeclaration: ClassDeclaration): NgModule | undefined {
    return this.getNgModules().find(ngModule => {
      return ngModule.getDirectDeclarations().some(declaration => declaration.getClassDeclaration() == classDeclaration)
    })
  }

  public getNgModuleWhereDeclaredOrThrow (classDeclaration: ClassDeclaration): NgModule {
    return throwIfUndefined(this.getNgModuleWhereDeclared(classDeclaration), `Expected to find "${classDeclaration.getName()}" among declarables.`)
  }

  public getRouteTree () {
    return this
  }

  public getComponentsByClassName (className: string): Component[] {
    const ngModules = this.getNgModules()
    return flatMap(ngModules, ngModule => ngModule.getComponents().filter(component => component.getName() == className))
  }

  /**
   * A variant of {@link getComponentsByClassName}. Use when you expect exactly one component.
   * @see getComponentsByClassName
   * @throws Error - If none or more than one are found.
   */
  public getComponentByClassNameIfSingleOrThrow (className: string): Component {
    return throwIfLengthNotOne(this.getComponentsByClassName(className), actual => `Expected exactly 1 component with class name "${className}" in the project but got ${actual}.`)
  }

  public getNgModuleByClassDeclaration (classDeclaration: ClassDeclaration): NgModule | undefined {
    return this.registeredNgModules.find(mod => mod.getClassDeclaration() == classDeclaration)
  }

  public isNgModuleRegistered (ngModuleClassDeclaration: ClassDeclaration): boolean {
    const existingNgModule = this.getNgModuleByClassDeclaration(ngModuleClassDeclaration)
    return existingNgModule != null
  }

  public registerNgModuleButThrowIfRegistered (ngModule: NgModule): NgModule {
    const classDeclaration = ngModule.getClassDeclaration()
    const existingNgModule = this.getNgModuleByClassDeclaration(classDeclaration)
    if (existingNgModule != null) {
      const name = classDeclaration.getName()
      const filePath = classDeclaration.getSourceFile().getFilePath()
      throw new Error(`NgModule for class declaration "${name}" in ${filePath} has already been registered to the project.`)
    }
    this.registeredNgModules.push(ngModule)
    return ngModule
  }

  public registerNgModuleOrIgnore (ngModule: NgModule): NgModule {
    const classDeclaration = ngModule.getClassDeclaration()
    const existingNgModule = this.getNgModuleByClassDeclaration(classDeclaration)
    if (existingNgModule == null) {
      this.registeredNgModules.push(ngModule)
    }
    return ngModule
  }

  public getDeclarableByClassDeclaration (classDeclaration: ClassDeclaration): Declarable | undefined {
    return this.allDeclarables.find(dec => dec.getClassDeclaration() == classDeclaration)
  }

  public isDeclarableRegistered (declarableClassDeclaration: ClassDeclaration): boolean {
    const existingDeclarable = this.getDeclarableByClassDeclaration(declarableClassDeclaration)
    return existingDeclarable != null
  }

  public registerDeclarable (declarableClassDeclaration: ClassDeclaration, ngModule: NgModule): Declarable {
    for (const existingDeclarable of this.allDeclarables) {
      if (declarableClassDeclaration == existingDeclarable.getClassDeclaration()) {
        const declarableName = existingDeclarable.getName()
        const ngModuleName = existingDeclarable.getNgModule().getName()
        const filePath = existingDeclarable.getClassDeclaration().getSourceFile().getFilePath()
        throw new Error(`Declarable "${declarableName}" in "${filePath}" has already been declared in ${ngModuleName}. Cannot declare it in ${ngModule.getName()}.`)
      }
    }
    const declarable = createDeclarable(this, ngModule, declarableClassDeclaration)
    this.allDeclarables.push(declarable)
    return declarable
  }

  public getRootRoutes (): Routes | undefined {
    for (const ngModule of this.getNgModules()) {
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
    return throwIfUndefined(this.getRootRoutes(), `Expected to find root routes in the project.`)
  }

  private setUpBuiltInNgModules () {
    const specifiers: string[] = [
      `router/router.d.ts#RouterModule`,
    ]
    specifiers.forEach(specifier => {
      const [moduleName, className] = specifier.split('#')
      const [root] = this.tsMorphProject.getRootDirectories()
      const fullPath = path.join(root.getPath(), `./node_modules/@angular/${moduleName}`)
      const file = this.tsMorphProject.getSourceFile(fullPath)
      if (file == null) {
        console.warn(`File "${fullPath}" not found. Skipping...`)
        return
      }
      const classDeclarations = file.getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      const classDeclaration = classDeclarations.find(declaration => declaration.getName() == className)
      if (classDeclaration == null) {
        console.warn(`Class declaration "${className}" not found in file "${fullPath}". Skipping...`)
        return
      }
      const ngModule = new NgModule(this, classDeclaration)
      this.builtInNgModules.push(ngModule)
    })
  }

  private setUp () {
    const mainTsFile = this.tsMorphProject.getSourceFile(`main.ts`)
    if (mainTsFile == null) throw new Error(`Could not find main.ts file.`)

    let bootstrapModuleIdentifier: any

    mainTsFile.forEachDescendant((node, traversal) => {
      if (!TypeGuards.isCallExpression(node)) return false
      if (node.getExpression().getText() != 'platformBrowserDynamic().bootstrapModule') return false
      const [firstArgument] = node.getArguments()
      bootstrapModuleIdentifier = firstArgument
      traversal.stop()
    })

    if (bootstrapModuleIdentifier == null) {
      throw new Error(`Expected to find a platformBrowserDynamic().bootstrapModule(xxx) call.`)
    }

    if (!TypeGuards.isIdentifier(bootstrapModuleIdentifier)) {
      throw new Error(`Expected bootstrapModule to have an identifier as the first argument.`)
    }

    const definitions = bootstrapModuleIdentifier.getDefinitionNodes()
    const classDeclaration = definitions.find(TypeGuards.isClassDeclaration)
    if (classDeclaration == null) {
      throw new Error(`Expected bootstrapModule's first argument to reference a class.`)
    }

    this.bootstrapModule = new NgModule(this, classDeclaration)
    this.registeredNgModules.push(this.bootstrapModule)
  }

}
