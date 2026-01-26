type AnyObject = Record<PropertyKey, unknown>

const isObject = (value: unknown): value is object => {
    return typeof value === 'object' && value !== null
}

const cloneAndFreeze = <T>(value: T, seen: WeakMap<object, unknown>): T => {
    if (!isObject(value)) return value

    const cached = seen.get(value)
    if (cached) return cached as T

    if (value instanceof Date) {
        const copy = new Date(value.getTime())
        seen.set(value, copy)
        Object.freeze(copy)
        return copy as T
    }

    if (value instanceof RegExp) {
        const copy = new RegExp(value.source, value.flags)
        copy.lastIndex = value.lastIndex
        seen.set(value, copy)
        Object.freeze(copy)
        return copy as T
    }

    if (value instanceof Map) {
        const copy = new Map()
        seen.set(value, copy)
        for (const [key, entryValue] of value.entries()) {
            copy.set(
                cloneAndFreeze(key, seen),
                cloneAndFreeze(entryValue, seen)
            )
        }
        Object.freeze(copy)
        return copy as T
    }

    if (value instanceof Set) {
        const copy = new Set()
        seen.set(value, copy)
        for (const entryValue of value.values()) {
            copy.add(cloneAndFreeze(entryValue, seen))
        }
        Object.freeze(copy)
        return copy as T
    }

    if (value instanceof ArrayBuffer) {
        const copy = value.slice(0)
        seen.set(value, copy)
        Object.freeze(copy)
        return copy as T
    }

    if (value instanceof DataView) {
        const bufferCopy = value.buffer.slice(0)
        const copy = new DataView(bufferCopy, value.byteOffset, value.byteLength)
        seen.set(value, copy)
        Object.freeze(copy)
        return copy as T
    }

    if (ArrayBuffer.isView(value)) {
        const ctor = value.constructor as {
            new (data: ArrayLike<number> | ArrayBufferLike): unknown
        }

        if ('length' in value && typeof value.length === 'number') {
            const copy = new ctor(value as ArrayLike<number>)
            seen.set(value, copy as object)
            Object.freeze(copy)
            return copy as T
        }
    }

    const proto = Object.getPrototypeOf(value)
    const copy = Object.create(proto) as AnyObject
    seen.set(value, copy)

    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key as keyof typeof descriptors]
        if (descriptor && 'value' in descriptor) {
            descriptor.value = cloneAndFreeze(descriptor.value, seen)
        }
        Object.defineProperty(copy, key, descriptor)
    }

    Object.freeze(copy)
    return copy as T
}

/**
 * Returns a deeply-frozen deep copy of a given object; does not modify the original object
 */
export default function deepFreeze<T>(input: T): Readonly<T> {
    const seen = new WeakMap<object, unknown>()
    return cloneAndFreeze(input, seen) as Readonly<T>
}
