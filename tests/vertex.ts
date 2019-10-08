import * as tsm from 'ts-morph'
import { insertion, Project } from '../src'
import { isElement, isElementWithTagName } from '../src/nodes/ng-ast-node/template/template-nodes-type-guards'
import { TemplateNodeType } from '../src/nodes/ng-ast-node/template/template-nodes-structs'
import { ElementTemplateNode, NgContainerTemplateNode } from '../src/nodes/ng-ast-node/template/template-nodes'

Error.stackTraceLimit = Infinity

const tsmProject = new tsm.Project({
  tsConfigFilePath: '/home/lazar/vertex/tsconfig.json',
  addFilesFromTsConfig: true,
})

const project = new Project(tsmProject)
const casinosComponent = project.getComponentByClassNameIfSingleOrThrow('CasinosComponent')
const template = casinosComponent.getTemplate()

const el = template.getFirstTemplateNodeOrThrow(isElementWithTagName('vtx-chip-button-group'))
el.changeTagName('new-tag-name-is-here-and-its-very-long')
el.insert(insertion.firstChild(), { type: TemplateNodeType.Element, tagName: 'a' })
const newEl = el.getFirstChildIfOrThrow(isElementWithTagName('a'), `Element "a" not the first child.`)
newEl.insert(insertion.lastChild(), { type: TemplateNodeType.Text, text: `opala` })
console.log(template.getText())

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
