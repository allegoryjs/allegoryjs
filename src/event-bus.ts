import { DefaultLogger, type Logger } from './logger'

export const defaultEmitStreams = {
    narrate: 'narrate',
} as const

export const WILDCARD = '*'

export type EventMap = Record<string, unknown>

export interface DefaultEventMap {
    [key: string]: unknown
    narrate: string[]
}

export interface EngineEvent {
    type: string
    payload?: unknown
    timestamp?: number
    source?: string
    cancelable?: boolean
}

export interface EmitContext<P = unknown> {
    type: string
    payload: P
    timestamp: number
    cancelled: boolean

    cancel(): void
}

export interface SubscribeOptions {
    priority?: number
    once?: boolean
}

export type Listener<P = unknown> = (payload: P, ctx: EmitContext<P>) => void | Promise<void>

interface ListenerEntry {
    callback: Listener<any>
    priority: number
    once: boolean
}

export interface EventBusConfig {
    maxListeners?: number
    enableBuffering?: boolean
    logger?: Logger
    onError?: (error: unknown, stream: string, listener: Listener<any>) => void
}

const DEFAULT_MAX_LISTENERS = 50

export type Disposer = () => void

export default class EventBus<T extends EventMap = DefaultEventMap> {
    #listeners = new Map<string, ListenerEntry[]>()
    #maxListeners: number
    #enableBuffering: boolean
    #buffer = new Map<string, EmitContext[]>()
    #logger: Logger
    #onError?: (error: unknown, stream: string, listener: Listener<any>) => void

    constructor(config?: EventBusConfig) {
        this.#maxListeners = config?.maxListeners ?? DEFAULT_MAX_LISTENERS
        this.#enableBuffering = config?.enableBuffering ?? false
        this.#logger = config?.logger ?? new DefaultLogger()
        this.#onError = config?.onError
    }

    // Type-safe subscribe for known streams
    subscribe<K extends keyof T & string>(stream: K, cb: Listener<T[K]>, options?: SubscribeOptions): Disposer
    // Wildcard / namespace / dynamic subscribe (payload is unknown)
    subscribe(stream: typeof WILDCARD | `${string}:*`, cb: Listener, options?: SubscribeOptions): Disposer
    subscribe(stream: string, cb: Listener<any>, options?: SubscribeOptions): Disposer {
        const entry: ListenerEntry = {
            callback: cb,
            priority: options?.priority ?? 0,
            once: options?.once ?? false,
        }

        if (!this.#listeners.has(stream)) {
            this.#listeners.set(stream, [])
        }

        const entries = this.#listeners.get(stream)!
        entries.push(entry)
        entries.sort((a, b) => b.priority - a.priority)

        this.#checkMaxListeners(stream)

        // replay buffered events for this stream
        if (this.#enableBuffering && this.#buffer.has(stream)) {
            const buffered = this.#buffer.get(stream)!
            this.#buffer.delete(stream)

            for (const ctx of buffered) {
                this.#invokeListener(entry, stream, ctx)
            }
        }

        this.#logger.debug(`Subscribed to stream "${stream}" (priority: ${entry.priority}, once: ${entry.once})`)

        return () => this.#removeListener(stream, cb)
    }

    // Type-safe once for known streams
    once<K extends keyof T & string>(stream: K, cb: Listener<T[K]>, options?: Omit<SubscribeOptions, 'once'>): Disposer
    once(stream: typeof WILDCARD | `${string}:*`, cb: Listener, options?: Omit<SubscribeOptions, 'once'>): Disposer
    once(stream: string, cb: Listener<any>, options?: Omit<SubscribeOptions, 'once'>): Disposer {
        return this.subscribe(stream, cb, { ...options, once: true })
    }

    // Type-safe emit for known streams
    emit<K extends keyof T & string>(stream: K, payload: T[K]): Promise<void>
    emit(stream: string, payload?: unknown): Promise<void>
    async emit(stream: string, payload?: unknown): Promise<void> {
        return this.#emitInternal(stream, payload)
    }

    // Explicit untyped emit for engine internals (dynamic event dispatch)
    async emitDynamic(stream: string, payload?: unknown): Promise<void> {
        return this.#emitInternal(stream, payload)
    }

    // Type-safe unsubscribe for known streams
    unsubscribe<K extends keyof T & string>(stream: K, cb?: Listener<T[K]>): void
    unsubscribe(stream: string, cb?: Listener<any>): void
    unsubscribe(stream: string, cb?: Listener<any>): void {
        if (!cb) {
            this.#listeners.delete(stream)
            this.#logger.debug(`Removed all listeners from stream "${stream}"`)
            return
        }
        this.#removeListener(stream, cb)
    }

    clear(): void {
        this.#listeners.clear()
        this.#buffer.clear()
        this.#logger.debug('All listeners and buffered events cleared')
    }

    dispose(): void {
        this.clear()
    }

    listenerCount(stream: string): number {
        return this.#listeners.get(stream)?.length ?? 0
    }

    eventNames(): string[] {
        return Array.from(this.#listeners.keys())
    }

    // ---- Private helpers ----

    async #emitInternal(stream: string, payload: unknown): Promise<void> {
        const ctx: EmitContext = {
            type: stream,
            payload: payload,
            timestamp: Date.now(),
            cancelled: false,
            cancel() { this.cancelled = true },
        }

        // collect matching listeners: exact match + namespace glob + wildcard
        const matched = this.#getMatchingListeners(stream)

        if (matched.length === 0 && this.#enableBuffering) {
            if (!this.#buffer.has(stream)) {
                this.#buffer.set(stream, [])
            }
            this.#buffer.get(stream)!.push(ctx)
            this.#logger.debug(`No listeners for "${stream}"; buffering event for later replay`)
            return
        }

        this.#logger.debug(`Emitting "${stream}" to ${matched.length} listener(s)`)

        // sort all matched listeners together by priority
        matched.sort((a, b) => b.entry.priority - a.entry.priority)

        const toRemove: Array<{ stream: string; cb: Listener<any> }> = []

        for (const { entry, matchedStream } of matched) {
            if (ctx.cancelled) {
                this.#logger.debug(`Event "${stream}" was cancelled; skipping remaining listeners`)
                break
            }

            await this.#invokeListener(entry, matchedStream, ctx)

            if (entry.once) {
                toRemove.push({ stream: matchedStream, cb: entry.callback })
            }
        }

        for (const { stream: s, cb } of toRemove) {
            this.#removeListener(s, cb)
        }
    }

    #getMatchingListeners(stream: string): Array<{ entry: ListenerEntry; matchedStream: string }> {
        const result: Array<{ entry: ListenerEntry; matchedStream: string }> = []

        for (const [registeredStream, entries] of this.#listeners) {
            if (
                registeredStream === stream ||
                registeredStream === WILDCARD ||
                this.#matchesNamespace(registeredStream, stream)
            ) {
                for (const entry of entries) {
                    result.push({ entry, matchedStream: registeredStream })
                }
            }
        }

        return result
    }

    // supports patterns like "combat:*" matching "combat:damage", "combat:heal", etc.
    #matchesNamespace(pattern: string, stream: string): boolean {
        if (!pattern.endsWith(':*')) return false
        const prefix = pattern.slice(0, -1) // "combat:" from "combat:*"
        return stream.startsWith(prefix)
    }

    async #invokeListener(entry: ListenerEntry, stream: string, ctx: EmitContext): Promise<void> {
        try {
            await entry.callback(ctx.payload, ctx)
        } catch (error) {
            if (this.#onError) {
                this.#onError(error, stream, entry.callback)
            } else {
                this.#logger.error(`Error in listener for "${stream}":`, error)
            }
        }
    }

    #removeListener(stream: string, cb: Listener<any>): void {
        const entries = this.#listeners.get(stream)
        if (!entries) return
        const idx = entries.findIndex(e => e.callback === cb)
        if (idx !== -1) entries.splice(idx, 1)
        if (entries.length === 0) this.#listeners.delete(stream)
    }

    #checkMaxListeners(stream: string): void {
        const count = this.#listeners.get(stream)?.length ?? 0
        if (count > this.#maxListeners) {
            this.#logger.warn(
                `Stream "${stream}" has ${count} listeners ` +
                `(max: ${this.#maxListeners}). Possible memory leak.`
            )
        }
    }
}
