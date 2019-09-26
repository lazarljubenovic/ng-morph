import * as tsm from 'ts-morph'

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

  throw new Error(`Could not resolve "${node.getText()}" in "${node.getSourceFile().getFilePath()}" (which is ${node.getKindName()}).`)
}
