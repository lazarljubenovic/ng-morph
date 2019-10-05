import * as tsm from 'ts-morph';
import * as tg from 'type-guards';

/**
 * Given a node, it tries to resolve all the elements given to it.
 *
 * @example
 * ```
 * // file
 * const foo = [bar]
 * const x = [baz, ...foo]
 *
 * // function call (symbolic syntax)
 * resolveArrayDestructing(x) => [baz, bar]
 * ```
 *
 * @example
 * ```
 * // file
 * const foo = [bar]
 * const baz = [...foo, qux]
 * const x = baz
 *
 * // function call (symbolic syntax)
 * resolveArrayDestructing(x) => [bar, qux]
 * ```
 */
export function resolveArrayDestructing(node: tsm.Node): tsm.Node[] {
  return _resolve(node);
}

function _resolve(node: tsm.Node): tsm.Node[] {
  if (tsm.TypeGuards.isArrayLiteralExpression(node)) {
    return node
      .getElements()
      .map(_resolveArrayElement)
      .reduce((acc, curr) => [...acc, ...curr], []);
  } else if (tsm.TypeGuards.isIdentifier(node)) {
    const definitions = node.getDefinitionNodes();
    const variableDefinition = definitions.find(
      tsm.TypeGuards.isVariableDeclaration
    );
    if (variableDefinition != null) {
      return _resolve(variableDefinition.getInitializerOrThrow());
    }
  }
  throw new Error(`Cannot resolve ${node.getText()}.`);
}

const isFallThrough = tg.fp.or(
  tsm.TypeGuards.isIdentifier,
  tsm.TypeGuards.isCallExpression
);

function _resolveArrayElement(node: tsm.Node): tsm.Node[] {
  if (isFallThrough(node)) {
    return [node];
  } else if (tsm.TypeGuards.isSpreadElement(node)) {
    const identifier = node.getExpression();
    if (!tsm.TypeGuards.isIdentifier(identifier))
      throw new Error(
        `Expected spread operator to have been used on an identifier.`
      );
    const definitions = identifier.getDefinitionNodes();
    const variableDefinition = definitions.find(
      tsm.TypeGuards.isVariableDeclaration
    );
    if (variableDefinition != null) {
      return _resolve(variableDefinition.getInitializerOrThrow());
    }
  }
  throw new Error(`Cannot resolve ${node.getText()}.`);
}
