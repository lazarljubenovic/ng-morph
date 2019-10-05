import * as tsm from 'ts-morph'
import { Project } from '../src/project'
import {
  isElementWithTagName,
  isTextAttributeWithName,
} from '../src/nodes/ng-ast-node/template/template-nodes-type-guards'

const tsmProject = new tsm.Project({
  tsConfigFilePath: '/home/lazar/vertex/tsconfig.json',
  addFilesFromTsConfig: true,
})

const project = new Project(tsmProject)
const casinosComponent = project.getComponentByClassNameIfSingleOrThrow('CasinosComponent')
const template = casinosComponent.getTemplate()

const pageHeaderEl = template
  .getTemplateNodeIfSingleOrThrow(isElementWithTagName('vtx-page-header'))
  .changeTagName('NEW_TAG_NAME')

pageHeaderEl
  .getDescendantOrThrow(isElementWithTagName('vtx-icon-casino'))
  .getFirstAttributeOrThrow(isTextAttributeWithName('size'))
  .changeName('NEW_ATTR_NAME')

console.log(template.getText())

// const templatePrinter = new TemplatePrinter()
// const printed = templatePrinter.print(template)
// console.log(printed)
