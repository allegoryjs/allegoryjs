import type {
  Listener,
  EventBusConfig,
  Disposer,
  EngineEvent,
  EmitStream,
  EventPayload,
} from '@/helpers/event-bus/event-bus.types'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'

import { WILDCARD } from './event-bus.types'

export default class EventBus {
  #listeners = new Map<string, Set<Listener<any>>>()
  #logger: Logger
  #debug: boolean

  constructor(config?: EventBusConfig) {
    this.#logger = config?.logger ?? new DefaultLogger()
    this.#debug = config?.debug ?? false
  }

  subscribe<Stream extends EmitStream>(stream: Stream, cb: Listener<Stream>): Disposer
  subscribe(stream: typeof WILDCARD | `${string}:*`, cb: Listener<any>): Disposer
  subscribe(stream: string, cb: Listener<any>): Disposer {
    const listeners = this.#listeners.getOrInsert(stream, new Set())

    listeners.add(cb)

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

  async emit<Stream extends EmitStream>(
    stream: Stream,
    payload: EventPayload<Stream>,
  ): Promise<void> {
    const event: EngineEvent<Stream> = {
      timestamp: Date.now(),
      payload,
    }

    if (this.#debug) {
      this.#logger.debug(`[EventBus] Emitted ${stream} at ${event.timestamp}`)
      this.#logger.silly`[EventBus] Payload for ${stream}: ${event.payload}`
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
