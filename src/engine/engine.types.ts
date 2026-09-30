import type EventBus from '@/helpers/event-bus/event-bus'
import type { EventBusConfig } from '@/helpers/event-bus/event-bus.types'
import type { Logger, LoggerConfig } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { EcsConfig } from '@/kernel/ecs/ecs.types'

export interface EngineOpts {
  ecs?: ECS
  ecsConfig?: EcsConfig

  eventBus?: EventBus
  eventBusConfig?: EventBusConfig

  logger?: Logger
  loggerConfig?: LoggerConfig
}

export interface EngineContext {
  readonly logger: Logger
  readonly ecs: ECS
  readonly eventBus: EventBus
}
