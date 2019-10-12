import * as tsm from 'ts-morph'
import { morph, Project } from '../src'
import {
  isElementWithClassName,
  isElementWithTagName,
  isNgTemplate,
} from '../src/nodes/ng-ast-node/template/template-nodes-type-guards'
import { TemplateNodeType } from '../src/nodes/ng-ast-node/template/template-nodes-structs'

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
el.morph(morph.insert.asChildAt(1), { type: TemplateNodeType.Element, tagName: 'a' })
// const newEl = el.getFirstChildIfOrThrow(isElementWithTagName('a'), `Element "a" not the asFirst child.`)
// newEl.morph(insertion.asLastChild(), { type: TemplateNodeType.Text, text: `opala` })
// newEl.morph(insertion.asFirstChild(), {
//   type: TemplateNodeType.Element,
//   tagName: 'inner',
//   children: [
//     {
//       type: TemplateNodeType.Element,
//       tagName: 'even-more-inner',
//       children: [
//         {
//           type: TemplateNodeType.Text,
//           text: 'uh...',
//         },
//       ],
//     },
//     {
//       type: TemplateNodeType.Text,
//       text: 'some trailing text after even-more-inner',
//     },
//   ],
// })
const spinner = template.getFirstTemplateNodeOrThrow(isElementWithTagName('vtx-spinner'))
spinner.morph(morph.insert.asFirstChild(), { type: TemplateNodeType.Text, text: 'text' })
spinner.morph(morph.insert.attribute.asFirst(), { type: TemplateNodeType.TextAttribute, name: 'key', value: 'value' })

const loading = template.getFirstTemplateNodeOrThrow(isElementWithClassName('loading'), `Element with class name "loading" not found.`)
console.log(loading.getText())

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
