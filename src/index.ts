import * as semver from 'semver'

const version = semver.valid(process.version)
if (version == null) { throw new Error(`Cannot read the Node version.`) }
if (!semver.satisfies(version, '>=12')) {
  throw new Error(`Expected Node version >=12, but got ${version}.`)
}

import { Project } from './project'
import * as insertion from './nodes/ng-ast-node/template/template-node-insertion-rules'

export {
  Project,
  insertion,
}
