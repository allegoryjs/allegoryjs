import type EventBus from '@/helpers/event-bus/event-bus'
import type { DefaultEventMap } from '@/helpers/event-bus/event-bus.types'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { EngineComponentSchema } from '@/kernel/ecs/ecs.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

export interface SemanticCacheConfig<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
  EventMapType extends DefaultEventMap<ComponentSchema> = DefaultEventMap<ComponentSchema>,
> {
  ecs: ECS<ComponentSchema>
  eventBus: EventBus<ComponentSchema, EventMapType>
  vectorize: (text: string) => number[]

  logger?: Logger
  customDescriptorAggregator?: (
    descriptors: Map<keyof ComponentSchema & string, string>,
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
