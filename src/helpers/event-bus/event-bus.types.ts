import type { Logger } from '@/helpers/logger/logger.types'
import type { ComponentName, Entity } from '@/kernel/ecs/ecs.types'

export const WILDCARD = '*'

export const DEFAULT_EMIT_STREAMS = {
  narrate: 'narrate',
  ecsComponentModified: 'ecsComponentModified',
  semanticCacheUpdated: 'semanticCacheUpdated',
} as const

export type SystemEmitStream = typeof DEFAULT_EMIT_STREAMS[keyof typeof DEFAULT_EMIT_STREAMS]

/**
 * In order to have the best type-safe development experience, declare the shape of
 * the game's custom event map by adding a d.ts file,
 * e.g. `events.d.ts`, import `'allegoryjs'`, and declare a module with an interface called
 * `CustomEventMap` with the component data shapes for the game. Then,
 * ensure that the d.ts file is included in the game's `tsconfig.json`, typically
 * by just `include`-ing all .ts files in the `src/` directory of the game project.
 *
 * @example
 * // events.d.ts
 * import 'allegoryjs'
 *
 * declare module 'allegoryjs' {
 *   interface CustomEventMap {
 *     dialogueInitiated: NpcName
 *     playerVisibilityChanged: VisibilityLevel
 *   }
 * }
 */
export interface CustomEventMap {}

export interface SystemEventMap {
  [DEFAULT_EMIT_STREAMS.narrate]: string[]
  [DEFAULT_EMIT_STREAMS.ecsComponentModified]: EcsComponentModifiedEventPayload
  [DEFAULT_EMIT_STREAMS.semanticCacheUpdated]: Entity
}

export type ActiveEventMap = CustomEventMap & SystemEventMap
export type EmitStream = keyof ActiveEventMap
export type EventPayload<Stream extends EmitStream> = ActiveEventMap[Stream]

export interface EcsComponentModifiedEventPayload {
  entity: Entity
  component: ComponentName
}

export interface EngineEvent<Stream extends EmitStream> {
  timestamp: number
  payload: EventPayload<Stream>
}

export type Listener<Stream extends EmitStream> = (event: EngineEvent<Stream>) => void | Promise<void>

export interface EventBusConfig {
  logger?: Logger
  debug?: boolean
}

export type Disposer = () => void
