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

export const ENGINE_LAYER = {
  /*********************
   *** Engine Layers ***
   *********************/
  // built-in operations, which typically handle basic functions (like saving),
  // which are easily overwritten
  core: 0,

  // Operations coming from world kits, providing the generic functionality which is
  // likely to be used by games in a given genre
  kit: 1,

  /***********************
   *** Userland Layers ***
   ***********************/

  // Operations related to the specific game being built.
  game: 2,

  // Operations related to a specific entity
  instance: 3,
} as const

export type EngineLayer = typeof ENGINE_LAYER[keyof typeof ENGINE_LAYER]
