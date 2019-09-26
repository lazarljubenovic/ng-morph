import { throwIfUndefined } from '../../../utils'
import { Declarable } from '../declarable'
import { ChangeDetectionStrategy, ViewEncapsulation } from './enums'
import { Decorator, TypeGuards } from 'ts-morph'
import * as tg from 'type-guards'
import * as path from 'path'
import * as fs from 'fs'
import * as angularCompiler from '@angular/compiler'
import { Template } from '../template/template'

export class Component extends Declarable {

  /**
   * Get the component's selector, if it exists.
   *
   * A selector is not obligatory to define. You can still use the component dynamically
   * with `ComponentFactoryResolver`, `ngComponentOutlet` and similar. In this case,
   * Angular will use `ng-component` as the tag name in the DOM.
   *
   * In such cases, this method will return undefined.
   *
   * See also:
   * @see {@link getSelectorNameOrThrow}
   *
   * @return The name of the selector, if it's defined. Otherwise, `undefined`.
   */
  public getSelectorDefinition (): string | undefined {
    const property = this.getDecoratorProperty(
      'selector',
      TypeGuards.isStringLiteral,
      `Expected @Component.selector to be a string literal`,
    )
    return property == null ? undefined : property.getLiteralValue()
  }

  /**
   * @see {@link getSelectorDefinition}
   */
  public getSelectorNameOrThrow (): string {
    return throwIfUndefined(this.getSelectorDefinition())
  }

  public getTemplateString (): string {
    const inlineTemplateString = this.getInlineTemplateString()
    const externalTemplateString = this.getExternalTemplateString()
    const templateString = inlineTemplateString != null ? inlineTemplateString : externalTemplateString
    return throwIfUndefined(templateString, `Expected component to have an inline or external template.`)
  }

  public getTemplate (): Template {
    const templateString = this.getTemplateString()
    const url = this.isInlineTemplate()
      ? this.getClassDeclaration().getSourceFile().getFilePath()
      : this.getExternalTemplatePathOrThrow()
    const output = angularCompiler.parseTemplate(templateString, url, { preserveWhitespaces: true })
    return Template.FromInternalAst(this.project, output)
  }

  public isInlineTemplate (): boolean {
    return this.getInlineTemplateString() != null
  }

  public getExternalTemplatePath (): string | undefined {
    return this.getTemplateUrl()
  }

  public getExternalTemplatePathOrThrow (): string {
    return throwIfUndefined(this.getExternalTemplatePath(), `Expected component "${this.getName()}" to have an external template.`)
  }

  public getChangeDetectionStrategy (): ChangeDetectionStrategy | undefined {
    const property = this.getDecoratorProperty(
      'changeDetection',
      TypeGuards.isPropertyAccessExpression,
      `Expected @Component.changeDetection to be a property access expression.`,
    )
    if (property == null) return undefined
    const expression = property.getExpression()
    const name = property.getName()

    if (!TypeGuards.isIdentifier(expression)) throw new Error(`Expected RHS of @Component.changeDetection to be an identifier.`)
    if (expression.getText() != 'ChangeDetectionStrategy') throw new Error(`Expected RHS of @Component.changeDetection to be ChangeDetectionStrategy.xxx.`)

    if (name == 'OnPush') return ChangeDetectionStrategy.OnPush
    if (name == 'Default') return ChangeDetectionStrategy.Default

    throw new Error(`Expected @Component.changeDetection to be "OnPush" or "Default".`)
  }

  public getChangeDetectionStrategyOrThrow (): ChangeDetectionStrategy {
    return throwIfUndefined(this.getChangeDetectionStrategy(), `Expected @Component.changeDetection to exist.`)
  }

  public getViewEncapsulation (): ViewEncapsulation | undefined {
    const property = this.getDecoratorProperty(
      'encapsulation',
      TypeGuards.isPropertyAccessExpression,
      `Expected @Component.encapsulation to be a property access expression.`,
    )
    if (property == null) return undefined
    const expression = property.getExpression()
    const name = property.getName()

    if (!TypeGuards.isIdentifier(expression)) throw new Error(`Expected RHS of @Component.encapsulation to be an identifier.`)
    if (expression.getText() != 'ChangeDetectionStrategy') throw new Error(`Expected RHS of @Component.encapsulation to be ChangeDetectionStrategy.xxx.`)

    if (name == 'Emulated') return ViewEncapsulation.Emulated
    if (name == 'Native') return ViewEncapsulation.Native
    if (name == 'None') return ViewEncapsulation.None
    if (name == 'ShadowDom') return ViewEncapsulation.ShadowDom

    throw new Error(`Expected @Component.encapsulation to be "Emulated", "Native", "None" or "ShadowDom".`)
  }

  public getViewEncapsulationOrThrow (): ViewEncapsulation {
    return throwIfUndefined(this.getViewEncapsulation(), `Expected @Component.viewEncapsulation to exist.`)
  }

  // region Internal

  private getDecorator (): Decorator {
    return this.classDeclaration.getDecoratorOrThrow('Component')
  }

  private getDecoratorProperty<T> (key: string, guard: tg.Guard<T>, message: string | ((actual: string) => string)): T | undefined {
    const decoratorArguments = this.getDecorator().getArguments()
    if (decoratorArguments.length != 1) throw new Error(`Expected @Component decorator to have only a single argument.`)
    const argument = decoratorArguments[0]
    if (!TypeGuards.isObjectLiteralExpression(argument)) throw new Error(`Expected the only argument of @Component decorator to be an object literal expression.`)
    const property = argument.getProperty(key)
    if (property == null) return undefined
    if (!TypeGuards.isPropertyAssignment(property)) throw new Error(`Expected a property assignment.`)
    const initializer = property.getInitializerOrThrow()
    const errorMessage = message != null ? message : `getDecoratorProperty predicate failed.`
    if (!guard(initializer)) throw new Error(typeof errorMessage == 'string' ? errorMessage : errorMessage(initializer.getKindName()))
    return initializer
  }

  private getDecoratorPropertyOrThrow<T> (key: string, guard: tg.Guard<T>, messageNotFound: string, messageGuardFail: string) {
    return throwIfUndefined(
      this.getDecoratorProperty(key, guard, messageGuardFail),
      messageNotFound,
    )
  }

  private getInlineTemplateString (): string | undefined {
    const property = this.getDecoratorProperty(
      'template',
      TypeGuards.isStringLiteral,
      kind => `Expected @Component.template to be a string literal, but got ${kind}.`,
    )
    return property == null ? undefined : property.getLiteralValue()
  }

  private getTemplateUrl (): string | undefined {
    const property = this.getDecoratorProperty(
      'templateUrl',
      TypeGuards.isStringLiteral,
      kind => `Expected @Component.templateUrl to be a string literal, but got ${kind}.`,
    )
    return property == null ? undefined : property.getLiteralValue()
  }

  private getExternalTemplateString (): string | undefined {
    const templateUrl = this.getTemplateUrl()
    if (templateUrl == null) return undefined
    return this.getExternalFile(templateUrl)
  }

  private getDirectoryPath () {
    return this.classDeclaration.getSourceFile().getDirectory().getPath()
  }

  private getExternalFile (relativePath: string): string {
    const directoryPath = this.getDirectoryPath()
    const filePath = path.join(directoryPath, relativePath)
    return fs.readFileSync(filePath, { encoding: 'utf8' })
  }

  // endregion Internal

}
