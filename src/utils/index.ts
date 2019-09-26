import * as tg from 'type-guards'
import * as tsm from 'ts-morph'
import { resolveTo } from './resolve-to'

export type Predicate<T> = (t: T) => boolean

export function throwIf<C> (predicate: (x: any) => x is C): <T>(x: T, msg?: string) => Exclude<T, C>
export function throwIf<C> (guard: (x: any) => boolean): <T>(x: any, msg?: string) => Exclude<T, undefined>
export function throwIf<C> (predicate: (x: any) => boolean) {
  return <T> (x: T, msg?: string) => {
    if (predicate(x)) {
      const message = msg == null ? `Assertion not met.` : msg
      throw new Error(message)
    }
    return x
  }
}

export const throwIfUndefined = throwIf(tg.isUndefined)
export const throwIfNull = throwIf(tg.isNull)
export const throwIfNullish = throwIf(tg.isNullish)

export function throwIfLengthNotOne<T> (array: T[], msg?: (actual: number) => string): T {
  if (array.length == 1) {
    return array[0]
  } else {
    throw new Error(msg == null ? `Expect exactly 1 elements but got ${array.length}.` : msg(array.length))
  }
}

export function flatMap<T, R> (array: T[], mapper: (element: T) => R[]): R[] {
  const result: R[] = []
  for (const element of array) {
    result.push(...mapper(element))
  }
  return result
}

/**
 *
 * @param object
 * @param propName
 * @param kind
 */
export function getPropertyValueOfKind<TKind extends tsm.SyntaxKind> (object: tsm.ObjectLiteralExpression,
                                                                      propName: string,
                                                                      kind: TKind): tsm.KindToNodeMappings[TKind] | undefined {
  const property = object.getProperty(propName)
  if (property == null) return undefined
  if (!tsm.TypeGuards.isPropertyAssignment(property)) return undefined
  const initializer = property.getInitializerOrThrow()
  return resolveTo(initializer, kind)
}

export function getPropertyValueOfKindOrThrow<TKind extends tsm.SyntaxKind> (object: tsm.ObjectLiteralExpression,
                                                                             propName: string,
                                                                             kind: TKind): tsm.KindToNodeMappings[TKind] {
  return throwIfUndefined(getPropertyValueOfKind(object, propName, kind), `Expected to find "${propName}" in ${object.getText()}.`)
}
