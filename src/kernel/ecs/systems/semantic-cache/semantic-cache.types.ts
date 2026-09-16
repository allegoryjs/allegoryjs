import type EventBus from '@/helpers/event-bus/event-bus'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { EngineComponentSchema } from '@/kernel/ecs/ecs.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

export interface SemanticCacheConfig<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
> {
  ecs: ECS<ComponentSchema>
  eventBus: EventBus
  resolvers: Map<keyof ComponentSchema & string, (componentData: any) => string>
  logger?: Logger
  customDescriptorBuilder?: (
    descriptors: Map<keyof ComponentSchema & string, string>,
  ) => DescriptorCacheEntry
}

export interface DescriptorCacheEntry {
  combined: string
  chunked: string[]
}
