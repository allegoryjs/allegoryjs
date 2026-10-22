import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { ActiveComponentSchema, ComponentName } from '@/kernel/ecs/ecs.types'

export type ComponentResolver<Component extends ComponentName = ComponentName> = (
  componentData: ActiveComponentSchema[Component],
  noun: string,
) => string[]

export interface ComponentResolverMap extends Omit<Map<ComponentName, any>, 'get' | 'set'> {
  get<Component extends ComponentName>(key: Component): ComponentResolver<Component> | undefined
  set<Component extends ComponentName>(key: Component, value: ComponentResolver<Component>): this
}

export interface SemanticCacheConfig {
  ecs: ECS
  logger: Logger
  vectorize: (text: string) => Float32Array
}

export type DescriptorCacheChunks = string[];

export interface SemanticCacheData {
  chunks?: Array<[descriptor: string, vector: Float32Array]>
}
