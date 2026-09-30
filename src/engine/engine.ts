import ECS from '@/kernel/ecs/ecs';
import type { EngineContext, EngineOpts } from './engine.types';
import type { Logger } from '@/helpers/logger/logger.types';
import EventBus from '@/helpers/event-bus/event-bus';
import { DefaultLogger } from '@/helpers/logger/logger';

export class AllegoryEngine {
  readonly #ecs: ECS
  readonly #logger: Logger
  readonly #eventBus: EventBus

  constructor({
    logger,
    loggerConfig,
    ecs,
    ecsConfig,
    eventBus,
    eventBusConfig,
  }: EngineOpts) {
    this.#logger = logger ?? new DefaultLogger(loggerConfig)
    this.#ecs = ecs ?? new ECS(this.ctx, ecsConfig ?? {})
    this.#eventBus = eventBus ?? new EventBus(this.ctx, eventBusConfig)
  }

  get ctx(): EngineContext {
    return {
      ecs: this.#ecs,
      logger: this.#logger,
      eventBus: this.#eventBus,
    }
  }
}
