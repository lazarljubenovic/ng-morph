import * as tsm from 'ts-morph'
import { Project } from '../src'
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

console.log()
console.log(`=== BEFORE ===`)
console.log(template.getTokens().map(tk => tk.printForDebug()).join('\n'))
console.log(`---------------------------------`)
console.log(template.getText())


const pageHeaderEl = template
  .getTemplateNodeIfSingleOrThrow(isElementWithTagName('vtx-page-header'))
  .changeTagName('shiny-tag')

const iconEl = template
  .getTemplateNodeIfSingleOrThrow(isElementWithTagName('vtx-icon-casino'))
  .getFirstAttributeOrThrow(isTextAttributeWithName('size'))
  .deleteValueOrThrow()

console.log()
console.log(`=== AFTER ===`)
console.log(template.getTokens().map(tk => tk.printForDebug()).join('\n'))
console.log(`---------------------------------`)
console.log(template.getText())

// const templatePrinter = new TemplatePrinter()
// const printed = templatePrinter.print(template)
// console.log(printed)
