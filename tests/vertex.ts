import * as tsm from 'ts-morph'
import { morph, Project } from '../src'
import {
  isElementWithMacroSyntaxAttributeWithName,
  isMacroSyntaxAttributeWithName,
} from '../src/nodes/ng-ast-node/template/template-nodes-type-guards'
import { throwIfLengthNotOne } from '../src/utils'
import * as casing from 'change-case'
import { TemplateNodeType } from '../src/nodes/ng-ast-node/template/template-nodes-structs'
import { NgContainerTemplateNode, NgTemplateTemplateNode } from '../src/nodes/ng-ast-node/template/template-nodes'

Error.stackTraceLimit = Infinity

const tsmProject = new tsm.Project({
  tsConfigFilePath: '/home/lazar/vertex/tsconfig.json',
  addFilesFromTsConfig: true,
})

const project = new Project(tsmProject)
const templates = project.getComponents().map(component => component.getTemplate())

const REGEX = /for '(?<keyName>.*?)'/g

for (const template of templates) {
  const templateNodes = template.getTemplateNodes(isElementWithMacroSyntaxAttributeWithName('vtxCell'))
  for (const templateNode of templateNodes) {
    const macroSyntaxAttributes = templateNode.getAttributes(isMacroSyntaxAttributeWithName('vtxCell'))
    const attribute = throwIfLengthNotOne(macroSyntaxAttributes)
    const value = attribute.getAttributeValueStringOrThrow()

    if (value.includes('named')) continue

    const {keyName} = Array.from(matchAll(value, REGEX))[0].groups!
    const i18nName = `@@tableHeader${casing.pascal(keyName)}`
    const referenceName = `tableHeader${casing.pascal(keyName)}Tpl`

    const newValue = value + ` named ${referenceName}`

    console.log(`==========`)
    console.log(value)
    console.log(newValue)
    console.log(keyName)

    attribute.changeAttributeValue(newValue)

    const ngTemplate: NgTemplateTemplateNode = template.getRoot().morph<any, TemplateNodeType.NgTemplate>(morph.insert.asLastChild(), {
      type: TemplateNodeType.NgTemplate,
    })
    ngTemplate.morph(morph.insert.attribute.asFirst(), {type: TemplateNodeType.Reference, name: referenceName})

    const ngContainer: NgContainerTemplateNode = ngTemplate.morph<any, TemplateNodeType.NgContainer>(morph.insert.asFirstChild(), {
      type: TemplateNodeType.NgContainer,
    })
    ngContainer.morph(morph.insert.attribute.asFirst(), {
      type: TemplateNodeType.TextAttribute,
      name: 'i18n',
      value: i18nName,
    })
    ngContainer.morph(morph.insert.asFirstChild(), {
      type: TemplateNodeType.Text,
      text: casing.sentence(keyName),
    })

    template.getRoot().morph(morph.insert.asLastChild(), {type: TemplateNodeType.Text, text: '\n'})

  }

  template.saveToDisk()
}

function* matchAll (str: string, regexp: RegExp) {
  const flags = regexp.global ? regexp.flags : regexp.flags + 'g'
  const re = new RegExp(regexp, flags)
  let match
  while (match = re.exec(str)) {
    yield match
  }
}

