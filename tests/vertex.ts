import * as tsm from 'ts-morph'
import { Project } from '../src/project'
import { LazyRoute } from '../src/nodes/ng-ast-node/route'
import { TemplatePrinter } from '../src/nodes/ng-ast-node/template/template-printer'

const tsmProject = new tsm.Project({
  tsConfigFilePath: '/home/lazar/vertex/tsconfig.json',
  addFilesFromTsConfig: true,
})

const project = new Project(tsmProject)
const casinosComponent = project.getSingleComponentByClassNameOrThrow('CasinosComponent')

const template = casinosComponent.getTemplate()
const templatePrinter = new TemplatePrinter()
const printed = templatePrinter.print(template)
console.log(printed)
