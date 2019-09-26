import * as tsm from 'ts-morph'
import * as chai from 'chai'
import * as tags from 'common-tags'

export function getResult<T> (sourceFileText: string, getResult: (sourceFile: tsm.SourceFile) => T): T {
  const project = new tsm.Project({ useVirtualFileSystem: true })
  const file = project.createSourceFile('test.ts', tags.stripIndent(sourceFileText))
  return getResult(file)
}

export function getActualAndExpected<T> (sourceFileText: string, getResults: (sourceFile: tsm.SourceFile) => { actual: T, expected: T }): { actual: T, expected: T } {
  return getResult<{ actual: T, expected: T }>(sourceFileText, getResults)
}

export function assertTransform (sourceFileText: string, doTest: (sourceFile: tsm.SourceFile) => void, expectedResultFileText: string) {
  const project = new tsm.Project({ useVirtualFileSystem: true })
  const file = project.createSourceFile('test.ts', tags.stripIndent(sourceFileText))
  doTest(file)
  const actualResultFileText = file.getText()
  chai.assert.equal(actualResultFileText, tags.stripIndent(expectedResultFileText))
}
