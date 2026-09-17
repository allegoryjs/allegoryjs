import type { Logger } from '@/helpers/logger/logger.types'
import type { EngineComponentSchema, Entity } from '@/kernel/ecs/ecs.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

export type EventMapSchema = Record<string, any>

export interface EcsComponentModifiedEventPayload<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO>
> {
  entity: Entity
  component: keyof ComponentSchema & string
}

export interface DefaultEventMap<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO>
> {
  narrate: string[]
  ecsComponentModified: EcsComponentModifiedEventPayload<ComponentSchema>
  ecsEntityCreated: Entity
  ecsEntityDestroyed: Entity
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
