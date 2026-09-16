import type { POJO, POJOValue } from './schemer.types'

export function isString(thing: unknown): thing is string {
  return typeof thing === 'string'
}

export function isNumber(thing: unknown): thing is number {
  return typeof thing === 'number'
}

export function isInteger(thing: unknown): thing is number {
  return (
    typeof thing === 'number' &&
    thing % 1 === 0 &&
    thing <= Number.MAX_SAFE_INTEGER &&
    thing >= Number.MIN_SAFE_INTEGER
  )
}

export function isBoolean(thing: unknown): thing is boolean {
  return typeof thing === 'boolean'
}

export function isNull(thing: unknown): thing is null {
  return thing === null
}

export function isPositiveInteger(thing: unknown): thing is number {
  return isInteger(thing) && thing > 0
}

export function isPojoArray(thing: unknown): thing is Array<POJOValue> {
  return Array.isArray(thing) && thing.every((val) => isPojoValue(val))
}

export function isPojoValue(thing: unknown): thing is POJOValue {
  const isPrimitive = (val: unknown) =>
    isString(val) || isNumber(val) || isInteger(val) || isBoolean(val) || isNull(val)

  return isPrimitive(thing) || isPojoArray(thing) || isPojo(thing)
}

export function isPojo(thing: unknown): thing is POJO {
  return (
    typeof thing === 'object' &&
    thing !== null &&
    !Array.isArray(thing) &&
    Reflect.ownKeys(thing).every(
      (k) => typeof k === 'string' && isPojoValue((thing as Record<string | symbol, unknown>)[k as string | symbol])
    )
  )
}

