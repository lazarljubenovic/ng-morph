import { Project } from '../../project'
import { LocationSpan } from './location'
import * as tsm from 'ts-morph'

export abstract class NgAstNode {

  constructor (protected project: Project,
               protected locationSpan: LocationSpan,
               protected tsmNode?: tsm.Node) {
  }

  public getLocationSpan (): LocationSpan {
    return this.locationSpan
  }

  public getText (): string {
    return this.getLocationSpan().getText()
  }

}
