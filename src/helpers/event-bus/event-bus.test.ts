import { describe, expect, it, beforeEach } from 'bun:test'

import EventBus from '@/helpers/event-bus/event-bus'
import { WILDCARD } from './event-bus.types'
import { DefaultLogger } from '@/helpers/logger/logger'

describe('EventBus', () => {
  let emitter: EventBus

  beforeEach(() => {
    const logger = new DefaultLogger({
      info: false,
      debug: false,
      error: false,
      warn: false,
    })
    emitter = new EventBus({ logger, debug: false })
  })

  it('delivers typed payloads to subscribers', async () => {
    const received: unknown[] = []

    emitter.subscribe('narrate', (event) => {
      received.push(event.payload)
      expect(event.timestamp).toBeDefined()
    })

    await emitter.emit('narrate', ['hello world'])

    expect(received).toEqual([['hello world']])
  })

  it('delivers events to wildcard listeners', async () => {
    const received: unknown[] = []

    emitter.subscribe(WILDCARD, (event) => {
      received.push(event.payload)
    })

    await emitter.emit('narrate', ['wildcard match'])

    expect(received).toEqual([['wildcard match']])
  })

  it('delivers events to namespace listeners', async () => {
    const received: unknown[] = []

    // We cast to any just for testing namespaces since ecs:* isn't a literal key in the schema,
    // but the type signature allows `${string}:*`
    emitter.subscribe('combat:*', (event) => {
      received.push(event.payload)
    })

    await emitter.emit('combat:damage-dealt', 123)

    expect(received[0]).toBe(123)

  })

  it('correctly matches colon-based namespaces', async () => {
    const bus = new EventBus()
    const received: number[] = []

    bus.subscribe('combat:*', (event) => {
      received.push(event.payload)
    })

    await bus.emit('combat:damage', 50)
    expect(received).toEqual([50])
  })

  it('unsubscribes correctly', async () => {
    let count = 0
    const dispose = emitter.subscribe('narrate', () => {
      count++
    })

    await emitter.emit('narrate', ['1'])
    dispose()
    await emitter.emit('narrate', ['2'])

    expect(count).toBe(1)
  })

  it('clears correctly', async () => {
    let count = 0
    emitter.subscribe('narrate', () => {
      count++
    })

    await emitter.emit('narrate', ['1'])
    emitter.clear()
    await emitter.emit('narrate', ['2'])

    expect(count).toBe(1)
  })
})
