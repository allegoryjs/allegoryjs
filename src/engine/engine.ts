import type { EngineContext, EngineOpts } from '@/engine/engine.types'
import DefaultEventBus from '@/helpers/event-bus/event-bus'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import DefaultECS from '@/kernel/ecs/ecs'

export class AllegoryEngine {
  readonly #logger: Logger
  readonly #ecs: DefaultECS
  readonly #eventBus: DefaultEventBus
  readonly #ctx: EngineContext

  constructor({ logger, loggerConfig, ecs, ecsConfig, eventBus, eventBusConfig }: EngineOpts = {}) {
    this.#logger = logger ?? new DefaultLogger(loggerConfig)
    this.#ecs = ecs ?? new DefaultECS(this.#logger, ecsConfig)
    this.#eventBus = eventBus ?? new DefaultEventBus(this.#logger, eventBusConfig)

    this.#ctx = Object.freeze({
      ecs: this.#ecs,
      logger: this.#logger,
      eventBus: this.#eventBus,
    })
  }

  get ctx(): EngineContext {
    return this.#ctx
  }
}
