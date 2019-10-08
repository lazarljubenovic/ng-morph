import * as tsm from 'ts-morph'

function couldNotResolveError (node: tsm.Node) {
  const text = node.getText()
  const filePath = node.getSourceFile().getFilePath()
  const kindName = node.getKindName()
  return new Error(`Could not resolve "${text}" in "${filePath}" (which is ${kindName}).`)
}

export function resolveTo<TSyntaxKind extends tsm.SyntaxKind> (node: tsm.Node, syntaxKind: TSyntaxKind): tsm.KindToNodeMappings[TSyntaxKind] {
  if (node.getKind() == syntaxKind) {
    return node as tsm.KindToNodeMappings[TSyntaxKind]
  }

  if (tsm.TypeGuards.isIdentifier(node)) {
    const definitions = node.getDefinitionNodes()

    const result = definitions.find(definition => definition.getKind() == syntaxKind) as tsm.KindToNodeMappings[TSyntaxKind] | undefined
    if (result != null) {
      return result
    }

    const variableDeclaration = definitions.find(tsm.TypeGuards.isVariableDeclaration)
    if (variableDeclaration != null) {
      const initializer = variableDeclaration.getInitializer()
      if (initializer != null) {
        return resolveTo(initializer, syntaxKind)
      }
    }
  }

  if (tsm.TypeGuards.isPropertyAccessExpression(node)) {
    const identifier = node.getExpression()
    if (tsm.TypeGuards.isIdentifier(identifier)) {
      const name = node.getName()
      const enumDeclaration = resolveTo(identifier, tsm.SyntaxKind.EnumDeclaration)
      const member = enumDeclaration.getMemberOrThrow(name)
      const initializer = member.getInitializer()
      if (initializer != null && initializer.getKind() == syntaxKind) {
        return initializer as tsm.KindToNodeMappings[TSyntaxKind]
      }

    }
  }

  throw couldNotResolveError(node)
}
