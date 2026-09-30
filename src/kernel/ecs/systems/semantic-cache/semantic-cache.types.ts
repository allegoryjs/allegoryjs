import type EventBus from '@/helpers/event-bus/event-bus'
import type { SystemEventMap } from '@/helpers/event-bus/event-bus.types'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { ComponentName, EngineComponentSchema } from '@/kernel/ecs/ecs.types'

export interface SemanticCacheConfig {
  ecs: ECS
  vectorize: (text: string) => number[]

  logger?: Logger
  customDescriptorAggregator?: (
    descriptors: Map<ComponentName, string>,
  ) => DescriptorCacheEntry
}

export interface DescriptorCacheEntry {
  combined: string
  chunked: string[]
}

export interface SemanticCacheData {
  dirty: boolean // whether the entity needs to have its cache recalculated due to component data update

  fullDescriptor?: string
  fullVector?: number[]
  chunks?: [descriptor: string, vector: number[]][]
}
