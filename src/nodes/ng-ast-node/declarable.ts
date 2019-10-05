import { NgAstNode } from './ng-ast-node';
import { ClassDeclaration } from 'ts-morph';
import { NgModule } from './ng-module';
import { Project } from '../../project';
import { LocationSpan } from './location';

export abstract class Declarable extends NgAstNode {
  public constructor(
    project: Project,
    protected ngModule: NgModule,
    protected classDeclaration: ClassDeclaration
  ) {
    super(project, LocationSpan.FromTsm(classDeclaration));
  }

  /**
   * Intended for more complex use-cases. Always check if there's a corresponding method
   * on the instance before utilizing this. Considering opening an issue if you think a
   * feature is missing from the library.
   */
  public getClassDeclaration(): ClassDeclaration {
    return this.classDeclaration;
  }

  public getName(): string {
    return this.getClassDeclaration().getNameOrThrow();
  }

  /**
   * The module in which a declarable is declared. By Angular's design, this is guaranteed
   * to be exactly one NgModule.
   */
  public getNgModule(): NgModule {
    return this.ngModule;
  }
}
