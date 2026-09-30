import { describe, expect, it } from 'bun:test'

import { AllegoryEngine } from '@/engine/engine'
import EventBus from '@/helpers/event-bus/event-bus'
import { DefaultLogger } from '@/helpers/logger/logger'
import { Logger } from '@/helpers/logger/logger.types'
import ECS from '@/kernel/ecs/ecs'

describe('AllegoryEngine', () => {
  it('instantiates with default options and fully initialized context', () => {
    const engine = new AllegoryEngine()

    expect(engine.ctx).toBeDefined()
    expect(engine.ctx.logger).toBeInstanceOf(Logger)
    expect(engine.ctx.ecs).toBeInstanceOf(ECS)
    expect(engine.ctx.eventBus).toBeInstanceOf(EventBus)

    // Context is frozen and stable
    expect(Object.isFrozen(engine.ctx)).toBe(true)
    expect(engine.ctx).toBe(engine.ctx)
  })

  it('accepts custom logger, ecs, and eventBus instances', () => {
    const logger = new DefaultLogger()
    const ecs = new ECS(logger)
    const eventBus = new EventBus(logger)

    const engine = new AllegoryEngine({
      logger,
      ecs,
      eventBus,
    })

    expect(engine.ctx.logger).toBe(logger)
    expect(engine.ctx.ecs).toBe(ecs)
    expect(engine.ctx.eventBus).toBe(eventBus)
  })

  it('passes configurations to default instances', () => {
    const engine = new AllegoryEngine({
      loggerConfig: {
        channelOpts: { debug: true },
      },
      ecsConfig: {
        defaultSystemPriority: 10,
      },
      eventBusConfig: {
        debug: true,
      },
    })

    expect(engine.ctx.logger).toBeDefined()
    expect(engine.ctx.ecs).toBeDefined()
    expect(engine.ctx.eventBus).toBeDefined()
  })
})
