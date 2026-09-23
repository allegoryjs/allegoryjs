import type { Logger } from '@/helpers/logger/logger.types'
import type { EngineComponentSchema, Entity } from '@/kernel/ecs/ecs.types'

export type EventMapSchema = Record<string, any>

export interface EcsComponentModifiedEventPayload<ComponentSchema extends EngineComponentSchema> {
  entity: Entity
  component: keyof ComponentSchema & string
}

export interface DefaultEventMap<ComponentSchema extends EngineComponentSchema> {
  narrate: string[]
  ecsComponentModified: EcsComponentModifiedEventPayload<ComponentSchema>
  semanticCacheUpdated: Entity
}

export interface EngineEvent<P> {
  timestamp: number
  payload: P
}

export type Listener<P> = (event: EngineEvent<P>) => void | Promise<void>

export interface EventBusConfig {
  logger?: Logger
  debug?: boolean
}

export type Disposer = () => void
