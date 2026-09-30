import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { ActiveComponentSchema, ComponentName } from '@/kernel/ecs/ecs.types'

export type ComponentResolver<Component extends ComponentName = ComponentName> = (
  componentData: ActiveComponentSchema[Component],
) => string

export interface ComponentResolverMap extends Omit<Map<ComponentName, any>, 'get' | 'set'> {
  get<Component extends ComponentName>(key: Component): ComponentResolver<Component> | undefined
  set<Component extends ComponentName>(key: Component, value: ComponentResolver<Component>): this
}

export interface SemanticCacheConfig {
  ecs: ECS
  vectorize: (text: string) => number[]

  logger?: Logger
  customDescriptorAggregator?: (descriptors: Map<ComponentName, string>) => DescriptorCacheEntry
}

export interface DescriptorCacheEntry {
  combined: string
  chunked: string[]
}

export interface SemanticCacheData {
  fullDescriptor?: string
  fullVector?: number[]
  chunks?: [descriptor: string, vector: number[]][]
}
