import * as tg from 'type-guards'
import * as tsm from 'ts-morph'
import { resolveTo } from './resolve-to'

export type Ctor<T> = (new (...args: any[]) => T) | (Function & { prototype: T })
export type StrictCtor<T> = (new (...args: any[]) => T)

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

export function concatErrors (mainErrorMessage: string, customErrorMessage?: string | undefined | null): string {
  return [mainErrorMessage, customErrorMessage].filter(tg.isNotNullish).join(' ')
}

export function getFirstElement<T> (array: T[]): T | undefined {
  return array[0]
}

export function getFirstElementOrThrow<T> (array: T[], err?: string): T {
  const msg = concatErrors(`Cannot get the first element of an empty array.`, err)
  return throwIfUndefined(getFirstElement(array), msg)
}

export function getLastElement<T> (array: T[]): T | undefined {
  return array[array.length - 1]
}

export function getLastElementOrThrow<T> (array: T[], err?: string): T {
  const msg = concatErrors(`Cannot get the last element of an empty array.`, err)
  return throwIfUndefined(getLastElement(array), msg)
}

export type TapFn<T, R = void> = (element: T, index: number, array: T[]) => R
