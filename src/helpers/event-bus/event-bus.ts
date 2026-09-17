import type {
  DefaultEventMap,
  Listener,
  EventBusConfig,
  Disposer,
  EngineEvent,
  EventMapSchema,
} from '@/helpers/event-bus/event-bus.types'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import type { EngineComponentSchema } from '@/kernel/ecs/ecs.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

export const defaultEmitStreams = {
  narrate: 'narrate',
  ecsComponentModified: 'ecsComponentModified',
  ecsEntityCreated: 'ecsEntityCreated',
  ecsEntityDestroyed: 'ecsEntityDestroyed',
  semanticCacheUpdated: 'semanticCacheUpdated',
} as const

export const WILDCARD = '*'

export default class EventBus<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO>,
  EventMapType extends EventMapSchema = DefaultEventMap<ComponentSchema>
> {
  #listeners = new Map<string, Set<Listener<any>>>()
  #logger: Logger
  #debug: boolean

  constructor(config?: EventBusConfig) {
    this.#logger = config?.logger ?? new DefaultLogger()
    this.#debug = config?.debug ?? false
  }

  subscribe<K extends keyof EventMapType & string>(
    stream: K,
    cb: Listener<EventMapType[K]>
  ): Disposer
  subscribe(
    stream: typeof WILDCARD | `${string}:*`,
    cb: Listener<any>
  ): Disposer
  subscribe(stream: string, cb: Listener<any>): Disposer {
    if (!this.#listeners.has(stream)) {
      this.#listeners.set(stream, new Set())
    }

    this.#listeners.get(stream)!.add(cb)

    if (this.#debug) {
      this.#logger.debug(`[EventBus] Subscribed to ${stream}`)
    }

    return () => this.unsubscribe(stream, cb)
  }

  unsubscribe(stream: string, cb?: Listener<any>): void {
    if (!cb) {
      this.#listeners.delete(stream)
      if (this.#debug) {
        this.#logger.debug(`[EventBus] Unsubscribed all listeners from ${stream}`)
      }
      return
    }

    const streamListeners = this.#listeners.get(stream)
    if (streamListeners) {
      streamListeners.delete(cb)
      if (streamListeners.size === 0) {
        this.#listeners.delete(stream)
      }
    }
    if (this.#debug) {
      this.#logger.debug(`[EventBus] Unsubscribed a listener from ${stream}`)
    }
  }

  async emit<K extends keyof EventMapType & string>(
    stream: K,
    payload: EventMapType[K]
  ): Promise<void> {
    const event: EngineEvent<EventMapType[K]> = {
      timestamp: Date.now(),
      payload
    }

    if (this.#debug) {
      this.#logger.debug(`[EventBus] Emitted ${stream} at ${event.timestamp} with payload:`, event.payload)
    }

    const listenersToInvoke = new Set<Listener<any>>()

    // Exact match
    if (this.#listeners.has(stream)) {
      for (const listener of this.#listeners.get(stream)!) {
        listenersToInvoke.add(listener)
      }
    }

    // Global wildcard match '*'
    if (this.#listeners.has(WILDCARD)) {
      for (const listener of this.#listeners.get(WILDCARD)!) {
        listenersToInvoke.add(listener)
      }
    }

    // Namespace wildcard match 'namespace:*'
    const colonIndex = stream.indexOf(':')
    if (colonIndex !== -1) {
      const namespaceWildcard = `${stream.slice(0, colonIndex)}:*`
      if (this.#listeners.has(namespaceWildcard)) {
        for (const listener of this.#listeners.get(namespaceWildcard)!) {
          listenersToInvoke.add(listener)
        }
      }
    }

    const promises = []
    for (const listener of listenersToInvoke) {
      promises.push(listener(event))
    }

    await Promise.all(promises)
  }

  clear(): void {
    this.#listeners.clear()
    if (this.#debug) {
      this.#logger.debug('[EventBus] Cleared all listeners')
    }
  }

  dispose(): void {
    this.clear()
  }
}
