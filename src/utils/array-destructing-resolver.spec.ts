import { getActualAndExpected } from './test-utils'
import { SyntaxKind } from 'typescript'
import { resolveArrayDestructing } from './array-destructing-resolver'
import * as chai from 'chai'
import { throwIfNullish } from './index'

describe(`resolveArrayDestructing`, () => {

  it(`doesn't do anything special when given a simple array literal`, () => {
    const file = `
      const x = [foo, bar]
    `
    const { actual, expected } = getActualAndExpected(file, file => {
      const declaration = file.getVariableDeclarationOrThrow('x')
      const arrayLiteral = declaration.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression)
      const actual = resolveArrayDestructing(arrayLiteral)
      const expected = arrayLiteral.getElements()
      return { actual, expected }
    })
    chai.assert.sameOrderedMembers(actual, expected)
  })

  it(`resolves one-level deep definition which leads to a simple array`, () => {
    const file = `
      const x = [foo, bar]
      const y = x
    `
    const { actual, expected } = getActualAndExpected(file, file => {
      const declarationX = file.getVariableDeclarationOrThrow('x')
      const arrayLiteral = declarationX.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression)
      const declarationY = file.getVariableDeclarationOrThrow('y')
      const usageOfX = declarationY.getInitializerIfKindOrThrow(SyntaxKind.Identifier)
      const actual = resolveArrayDestructing(usageOfX)
      const expected = arrayLiteral.getElements()
      return { actual, expected }
    })
    chai.assert.sameOrderedMembers(actual, expected)
  })

  it(`resolves maybe-levels deep definition which leads to a simple array`, () => {
    const file = `
      const x = [foo, bar]
      const y1 = x
      const y2 = y1
      const y3 = y2
      const y4 = y3
    `
    const { actual, expected } = getActualAndExpected(file, file => {
      const declarationX = file.getVariableDeclarationOrThrow('x')
      const arrayLiteral = declarationX.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression)
      const declarationY4 = file.getVariableDeclarationOrThrow('y4')
      const usageOfX = declarationY4.getInitializerIfKindOrThrow(SyntaxKind.Identifier)
      const actual = resolveArrayDestructing(usageOfX)
      const expected = arrayLiteral.getElements()
      return { actual, expected }
    })
    chai.assert.sameOrderedMembers(actual, expected)
  })

  it(`resolves spread operator in a simple scenario correctly`, () => {
    const file = `
      const foo = [bar]
      const x = [...foo, qux]
    `
    const { actual, expected } = getActualAndExpected(file, file => {
      const identifiers = file.getDescendantsOfKind(SyntaxKind.Identifier)
      const bar = throwIfNullish(identifiers.find(identifier => identifier.getText() == 'bar'))
      const qux = throwIfNullish(identifiers.find(identifier => identifier.getText() == 'qux'))
      const expected = [bar, qux]

      const declarationX = file.getVariableDeclarationOrThrow('x')
      const arrayLiteralExpression = declarationX.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression)
      const actual = resolveArrayDestructing(arrayLiteralExpression)

      return { actual, expected }
    })
    chai.assert.sameOrderedMembers(actual, expected)
  })

})
