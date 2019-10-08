import * as tsm from 'ts-morph'
import { Project } from '../src'
import {
  isElement,
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

const elements = template.getTemplateNodes(isElement)
console.log(`There are ${elements.length} elements in ${casinosComponent.getSelectorNameOrThrow()}'s template.`)

// console.log()
// console.log(`=== BEFORE ===`)
// console.log(template.getTokens().map(tk => tk.printForDebug()).join('\n'))
// console.log(`---------------------------------`)
// console.log(template.getText())

// const pageHeaderEl = template
//   .getTemplateNodeIfSingleOrThrow(isElementWithTagName('vtx-page-header'))
//   .changeTagName('shiny-tag')
//
// pageHeaderEl
//   .getFirstAttributeOrThrow(isTextAttributeWithName('disabled'))
//   .changeAttributeName('doesItWork')
//   .addAttributeValueOrThrowIfAlreadyExists('FUCK YES BABY')

// pageHeaderEl
//   .getDescendantOrThrow(isElementWithTagName('vtx-icon-casino'))
//   .getFirstAttributeOrThrow(isTextAttributeWithName('size'))
//   .changeAttributeName('NEW_ATTR_NAME')

// console.log()
// console.log(`=== AFTER ===`)
// console.log(template.getTokens().map(tk => tk.printForDebug()).join('\n'))
// console.log(`---------------------------------`)
// console.log(template.getText())

// const templatePrinter = new TemplatePrinter()
// const printed = templatePrinter.print(template)
// console.log(printed)
