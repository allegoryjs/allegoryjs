import { describe, expect, it, beforeEach, spyOn } from 'bun:test'

import EventBus, { WILDCARD } from '@/event-bus/event-bus'
import type { EmitContext, Listener, EventMap } from '@/event-bus/event-bus.types'

describe('EventBus', () => {
  let emitter: EventBus

  beforeEach(() => {
    emitter = new EventBus()
  })

  // =============================
  // Phase 1: Core Features
  // =============================

  describe('subscribe and emit', () => {
    it('delivers payload to subscribers', async () => {
      const received: unknown[] = []
      emitter.subscribe('test', (payload) => {
        received.push(payload)
      })

      await emitter.emit('test', 'hello')

      expect(received).toEqual(['hello'])
    })

    it('supports multiple subscribers on the same stream', async () => {
      let count = 0
      emitter.subscribe('test', () => {
        count++
      })
      emitter.subscribe('test', () => {
        count++
      })

      await emitter.emit('test')

      expect(count).toBe(2)
    })

    it('does not deliver events to unrelated streams', async () => {
      let called = false
      emitter.subscribe('other', () => {
        called = true
      })

      await emitter.emit('test')

      expect(called).toBe(false)
    })

    it('handles async subscribers', async () => {
      const order: number[] = []
      emitter.subscribe('test', async () => {
        await new Promise((r) => setTimeout(r, 10))
        order.push(1)
      })
      emitter.subscribe('test', () => {
        order.push(2)
      })

      await emitter.emit('test')

      expect(order).toEqual([1, 2])
    })
  })

  describe('unsubscribe', () => {
    it('returns a disposer from subscribe', async () => {
      let count = 0
      const dispose = emitter.subscribe('test', () => {
        count++
      })

      await emitter.emit('test')
      expect(count).toBe(1)

      dispose()
      await emitter.emit('test')
      expect(count).toBe(1)
    })

    it('removes a specific callback via unsubscribe', async () => {
      let aCount = 0
      let bCount = 0
      const cbA: Listener = () => {
        aCount++
      }
      const cbB: Listener = () => {
        bCount++
      }

      emitter.subscribe('test', cbA)
      emitter.subscribe('test', cbB)

      emitter.unsubscribe('test', cbA)
      await emitter.emit('test')

      expect(aCount).toBe(0)
      expect(bCount).toBe(1)
    })

    it('removes all listeners on a stream when no callback is provided', async () => {
      let count = 0
      emitter.subscribe('test', () => {
        count++
      })
      emitter.subscribe('test', () => {
        count++
      })

      emitter.unsubscribe('test')
      await emitter.emit('test')

      expect(count).toBe(0)
    })
  })

  describe('once', () => {
    it('fires only once then auto-unsubscribes', async () => {
      let count = 0
      emitter.once('test', () => {
        count++
      })

      await emitter.emit('test')
      await emitter.emit('test')
      await emitter.emit('test')

      expect(count).toBe(1)
    })

    it('can be manually disposed before firing', async () => {
      let called = false
      const dispose = emitter.once('test', () => {
        called = true
      })

      dispose()
      await emitter.emit('test')

      expect(called).toBe(false)
    })
  })

  describe('error isolation', () => {
    it('does not let a bad listener break other listeners', async () => {
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
      let secondCalled = false

      emitter.subscribe('test', () => {
        throw new Error('boom')
      })
      emitter.subscribe('test', () => {
        secondCalled = true
      })

      await emitter.emit('test')

      expect(secondCalled).toBe(true)
      consoleSpy.mockRestore()
    })

    it('routes errors to custom onError handler', async () => {
      const errors: unknown[] = []
      const em = new EventBus({
        onError: (err) => {
          errors.push(err)
        },
      })

      em.subscribe('test', () => {
        throw new Error('kaboom')
      })
      await em.emit('test')

      expect(errors).toHaveLength(1)
      expect((errors[0] as Error).message).toBe('kaboom')
    })
  })

  describe('clear and dispose', () => {
    it('removes all listeners with clear()', async () => {
      let count = 0
      emitter.subscribe('a', () => {
        count++
      })
      emitter.subscribe('b', () => {
        count++
      })

      emitter.clear()
      await emitter.emit('a')
      await emitter.emit('b')

      expect(count).toBe(0)
    })

    it('dispose() also clears everything', async () => {
      let count = 0
      emitter.subscribe('a', () => {
        count++
      })
      emitter.dispose()
      await emitter.emit('a')
      expect(count).toBe(0)
    })
  })

  // =============================
  // Phase 2: Advanced Features
  // =============================

  describe('wildcard listener', () => {
    it('receives all events', async () => {
      const received: string[] = []
      emitter.subscribe(WILDCARD, (payload, ctx) => {
        received.push(ctx.type)
      })

      await emitter.emit('combat:damage')
      await emitter.emit('narrate')
      await emitter.emit('inventory:add')

      expect(received).toEqual(['combat:damage', 'narrate', 'inventory:add'])
    })

    it('fires alongside stream-specific listeners', async () => {
      const log: string[] = []
      emitter.subscribe('test', () => {
        log.push('specific')
      })
      emitter.subscribe(WILDCARD, () => {
        log.push('wildcard')
      })

      await emitter.emit('test')

      expect(log).toContain('specific')
      expect(log).toContain('wildcard')
    })
  })

  describe('namespaced events', () => {
    it('matches combat:* to combat:damage', async () => {
      let called = false
      emitter.subscribe('combat:*', () => {
        called = true
      })

      await emitter.emit('combat:damage')

      expect(called).toBe(true)
    })

    it('does not match combat:* to inventory:add', async () => {
      let called = false
      emitter.subscribe('combat:*', () => {
        called = true
      })

      await emitter.emit('inventory:add')

      expect(called).toBe(false)
    })

    it('matches exact stream over namespace pattern', async () => {
      const log: string[] = []
      emitter.subscribe('combat:damage', () => {
        log.push('exact')
      })
      emitter.subscribe('combat:*', () => {
        log.push('namespace')
      })

      await emitter.emit('combat:damage')

      expect(log).toContain('exact')
      expect(log).toContain('namespace')
      expect(log).toHaveLength(2)
    })
  })

  describe('priority ordering', () => {
    it('executes higher priority listeners first', async () => {
      const order: string[] = []

      emitter.subscribe(
        'test',
        () => {
          order.push('low')
        },
        { priority: 1 },
      )
      emitter.subscribe(
        'test',
        () => {
          order.push('high')
        },
        { priority: 10 },
      )
      emitter.subscribe(
        'test',
        () => {
          order.push('mid')
        },
        { priority: 5 },
      )

      await emitter.emit('test')

      expect(order).toEqual(['high', 'mid', 'low'])
    })

    it('defaults to priority 0', async () => {
      const order: string[] = []

      emitter.subscribe('test', () => {
        order.push('default')
      })
      emitter.subscribe(
        'test',
        () => {
          order.push('explicit-zero')
        },
        { priority: 0 },
      )
      emitter.subscribe(
        'test',
        () => {
          order.push('high')
        },
        { priority: 1 },
      )

      await emitter.emit('test')

      expect(order[0]).toBe('high')
    })
  })

  describe('event metadata / EmitContext', () => {
    it('provides timestamp in context', async () => {
      let ctx: EmitContext | undefined
      emitter.subscribe('test', (_payload, c) => {
        ctx = c
      })

      const before = Date.now()
      await emitter.emit('test')
      const after = Date.now()

      expect(ctx).toBeDefined()
      expect(ctx!.timestamp).toBeGreaterThanOrEqual(before)
      expect(ctx!.timestamp).toBeLessThanOrEqual(after)
    })

    it('provides the stream type in context', async () => {
      let ctx: EmitContext | undefined
      emitter.subscribe('my-event', (_p, c) => {
        ctx = c
      })

      await emitter.emit('my-event')

      expect(ctx!.type).toBe('my-event')
    })

    it('supports cancellation', async () => {
      const order: string[] = []

      emitter.subscribe(
        'test',
        (_p, ctx) => {
          order.push('first')
          ctx.cancel()
        },
        { priority: 10 },
      )
      emitter.subscribe(
        'test',
        () => {
          order.push('second')
        },
        { priority: 1 },
      )

      await emitter.emit('test')

      expect(order).toEqual(['first'])
    })
  })

  // =============================
  // Phase 3: Nice-to-Haves
  // =============================

  describe('event buffering / replay', () => {
    it('buffers events when no subscribers exist', async () => {
      const em = new EventBus({ enableBuffering: true })

      await em.emit('test', 'buffered-data')

      let received: unknown
      em.subscribe('test', (payload) => {
        received = payload
      })

      expect(received).toBe('buffered-data')
    })

    it('replays multiple buffered events in order', async () => {
      const em = new EventBus({ enableBuffering: true })

      await em.emit('test', 1)
      await em.emit('test', 2)
      await em.emit('test', 3)

      const received: unknown[] = []
      em.subscribe('test', (payload) => {
        received.push(payload)
      })

      expect(received).toEqual([1, 2, 3])
    })

    it('does not buffer when disabled (default)', async () => {
      await emitter.emit('test', 'lost')

      let received: unknown = 'unchanged'
      emitter.subscribe('test', (payload) => {
        received = payload
      })

      expect(received).toBe('unchanged')
    })

    it('clears buffer after replay', async () => {
      const em = new EventBus({ enableBuffering: true })

      await em.emit('test', 'first-sub-data')

      const first: unknown[] = []
      em.subscribe('test', (payload) => {
        first.push(payload)
      })

      const second: unknown[] = []
      em.subscribe('test', (payload) => {
        second.push(payload)
      })

      // second subscriber should not get old buffered data (already drained)
      expect(first).toEqual(['first-sub-data'])
      expect(second).toEqual([])
    })
  })

  describe('max listeners warning', () => {
    it('warns when listener count exceeds maxListeners', () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
      const em = new EventBus({ maxListeners: 2 })

      em.subscribe('test', () => {})
      em.subscribe('test', () => {})
      expect(warnSpy).not.toHaveBeenCalled()

      em.subscribe('test', () => {})
      expect(warnSpy).toHaveBeenCalledTimes(1)

      warnSpy.mockRestore()
    })
  })

  // =============================
  // Utility methods
  // =============================

  describe('utility methods', () => {
    it('reports listener count', () => {
      emitter.subscribe('a', () => {})
      emitter.subscribe('a', () => {})
      emitter.subscribe('b', () => {})

      expect(emitter.listenerCount('a')).toBe(2)
      expect(emitter.listenerCount('b')).toBe(1)
      expect(emitter.listenerCount('c')).toBe(0)
    })

    it('lists event names', () => {
      emitter.subscribe('x', () => {})
      emitter.subscribe('y', () => {})

      const names = emitter.eventNames()
      expect(names).toContain('x')
      expect(names).toContain('y')
    })
  })

  // =============================
  // emitDynamic
  // =============================

  describe('emitDynamic', () => {
    it('emits to listeners just like emit', async () => {
      const received: unknown[] = []
      emitter.subscribe('test', (payload) => {
        received.push(payload)
      })

      await emitter.emitDynamic('test', 'via-dynamic')

      expect(received).toEqual(['via-dynamic'])
    })

    it('works with wildcard listeners', async () => {
      const types: string[] = []
      emitter.subscribe(WILDCARD, (_p, ctx) => {
        types.push(ctx.type)
      })

      await emitter.emitDynamic('anything', 42)

      expect(types).toEqual(['anything'])
    })
  })

  // =============================
  // Type-safe EventMap generics
  // =============================

  describe('typed EventBus', () => {
    interface GameEvents extends EventMap {
      narrate: string[]
      'combat:damage': { target: number; amount: number }
      'inventory:add': { entityId: number; item: string }
    }

    let typedBus: EventBus<GameEvents>

    beforeEach(() => {
      typedBus = new EventBus<GameEvents>()
    })

    it('delivers typed payloads to subscribers', async () => {
      let received: string[] | undefined
      typedBus.subscribe('narrate', (payload) => {
        received = payload
      })

      await typedBus.emit('narrate', ['Hello', 'World'])

      expect(received).toEqual(['Hello', 'World'])
    })

    it('delivers complex typed payloads', async () => {
      let received: { target: number; amount: number } | undefined
      typedBus.subscribe('combat:damage', (payload) => {
        received = payload
      })

      await typedBus.emit('combat:damage', {
        target: 1,
        amount: 50,
      })

      expect(received).toEqual({
        target: 1,
        amount: 50,
      })
    })

    it('supports wildcard on typed bus with unknown payload', async () => {
      const events: string[] = []
      typedBus.subscribe(WILDCARD, (_payload, ctx) => {
        events.push(ctx.type)
      })

      await typedBus.emit('narrate', ['test'])
      await typedBus.emit('combat:damage', {
        target: 1,
        amount: 10,
      })

      expect(events).toEqual(['narrate', 'combat:damage'])
    })

    it('supports namespace patterns on typed bus', async () => {
      const events: unknown[] = []
      typedBus.subscribe('combat:*', (payload) => {
        events.push(payload)
      })

      await typedBus.emit('combat:damage', {
        target: 1,
        amount: 25,
      })
      await typedBus.emit('inventory:add', {
        entityId: 1,
        item: 'sword',
      })

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        target: 1,
        amount: 25,
      })
    })

    it('supports emitDynamic for untyped engine dispatch', async () => {
      const received: unknown[] = []
      typedBus.subscribe('narrate', (payload) => {
        received.push(payload)
      })

      await typedBus.emitDynamic('narrate', ['dynamic'])

      expect(received).toEqual([['dynamic']])
    })
  })
})
