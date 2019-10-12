import * as semver from 'semver'

const version = semver.valid(process.version)
if (version == null) { throw new Error(`Cannot read the Node version.`) }
if (!semver.satisfies(version, '>=12')) {
  throw new Error(`Expected Node version >=12, but got ${version}.`)
}

import { Project } from './project'
import * as morph from './morph'

export {
  Project,
  morph,
}
