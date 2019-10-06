import { ElementLikeTemplateNode, InterpolationTemplateNode, TemplateNode, TextTemplateNode } from './template-nodes'
import { Template } from './template'
import * as tntg from './template-nodes-type-guards'
import { isBoundAttribute, isBoundEvent, isTextAttribute } from './template-nodes-type-guards'

const INDENTATION = 2

function prefixWithSpaces (spaces: number, string: string): string {
  const prefix = ''.padStart(spaces * INDENTATION)
  return prefix + string
}

export class TemplatePrinter {

  public print (template: Template): string {
    return template.getRoots().map(root => this.printTemplateNode(root, 0)).join('\n')
  }

  private printTemplateNode (templateNode: TemplateNode, indent: number): string {
    const templateChildren = templateNode.getTemplateChildren()
    const fullLine = prefixWithSpaces(indent, this.printLine(templateNode)) + ` ~ ` + templateNode.getLocationSpan().printMedium({oneBased: true})
    if (templateChildren.length > 0) {
      return fullLine + '\n' + templateChildren.map(child => this.printTemplateNode(child, indent + 1)).join('\n')
    } else {
      return fullLine
    }
  }

  private printLine (templateNode: TemplateNode): string {
    if (tntg.isText(templateNode)) return this.printLineText(templateNode)
    if (tntg.isInterpolation(templateNode)) return this.printLineInterpolation(templateNode)
    if (tntg.isElementLike(templateNode)) return this.printLineElementLike(templateNode)
    console.error(templateNode)
    throw new Error(`Not implemented.`)
  }

  private printLineText (templateNode: TextTemplateNode) {
    return `[TEXT] ${templateNode.getText().trim()}`
  }

  private printLineInterpolation (templateNode: InterpolationTemplateNode): string {
    return `[INTERPOLATION] ${templateNode.getText().trim()}`
  }

  private printLineElementLike (templateNode: ElementLikeTemplateNode): string {
    const tagName = templateNode.getTagName()
    const attributes = templateNode.getAttributes(isTextAttribute).map(input => `${input.getAttributeNameString()} => ${input.getAttributeValueString()}`).join(', ')
    const inputs = templateNode.getAttributes(isBoundAttribute).map(input => `${input.getAttributeNameString()} => ${input.getAttributeValueString()}`).join(', ')
    const outputs = templateNode.getAttributes(isBoundEvent).map(input => `${input.getAttributeNameString()} => ${input.getHandler()}`).join(', ')
    return `[ELEMENT LIKE] <${tagName}> ${attributes} :: ${inputs} :: ${outputs}`
  }

}
