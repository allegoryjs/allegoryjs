import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { SalienceCacheData } from '@/kernel/ecs/systems/salience/salience.types'
import type { SemanticCacheData } from '@/kernel/ecs/systems/semantic-cache/semantic-cache.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

export type Entity = number

export const SYSTEM_SCHEMA_COMPONENTS = {
  tags: 'Tags',
  meta: 'Meta',
  noun: 'Noun',
  semanticCache: 'SemanticCache',
} as const

export const MANDATORY_COMPONENTS = [
  SYSTEM_SCHEMA_COMPONENTS.tags,
  SYSTEM_SCHEMA_COMPONENTS.meta,
] as const

export type MandatoryComponent = (typeof MANDATORY_COMPONENTS)[number]

/**
 * In order to have the best type-safe development experience, declare the shape of
 * the game's custom component schema by adding a d.ts file,
 * e.g. `components.d.ts`, import `'allegoryjs'`, and declare a module with an interface called
 * `CustomComponentSchema` with the component data shapes for the game. Then,
 * ensure that the d.ts file is included in the game's `tsconfig.json`, typically
 * by just `include`-ing all .ts files in the `src/` directory of the game project.
 *
 * @example
 * // components.d.ts
 * import 'allegoryjs'
 *
 * declare module 'allegoryjs' {
 *   interface CustomComponentSchema {
 *     position: { x: number; y: number }
 *     health: { current: number; max: number }
 *     stats: { strength: number; intelligence: number; dexterity: number }
 *     nested: { a: { b: number } }
 *   }
 * }
 */
export interface CustomComponentSchema {}

export interface EngineComponentSchema extends Record<string, POJO> {
  // all entities have this component
  Tags: {
    list: Array<string>
  }

  // all entities have this component
  Meta: {
    name: string
    created: number // ms since epoch

    // pretty ID set by the developer; not to be confused
    // with the entity ID, which is an integer.
    // not used for any game logic; mostly just for debugging
    id: string
  }

  // only entities which the player can interact via input/command should have this component.
  // this component is used in the NLP pipeline to identify which entity(s) the user may be referring to in their command input
  Noun: {
    noun: string // the main noun word/concept associated with the entity, e.g. "sword" or "potion bottle"
  }

  SemanticCache: SemanticCacheData & POJO

  SalienceCache: SalienceCacheData & POJO
}

export type ActiveComponentSchema = EngineComponentSchema & CustomComponentSchema
export type ComponentName = keyof ActiveComponentSchema

export interface ComponentRegistrationOptions {
  /**
   * Whether the component data should be serialized when exporting ECS state.
   * Set to false for data which can be derived at engine init, to reduce the size of save files.
   *
   * @default true
   */
  serialize?: boolean
}

export interface EcsReadonlyFacade {
  entityExists(entity: Entity): boolean
  entityHasComponent(
    entity: Entity,
    componentName: ComponentName,
  ): boolean
  getEntityByPrettyId(prettyId: string): Entity | undefined
  getComponentsOnEntity(entity: Entity): Set<ComponentName>
  getEntitiesByComponents(
    ...componentTypes: ComponentName[]
  ): Set<Entity>
  getEntityComponentData<Component extends MandatoryComponent>(
    entity: Entity,
    name: Component,
  ): ActiveComponentSchema[Component]
  getEntityComponentData<Component extends ComponentName>(
    entity: Entity,
    name: Component,
  ): ActiveComponentSchema[Component] | undefined
  getAllEntityComponentData(
    entity: Entity,
  ): Partial<{ [K in keyof ActiveComponentSchema & string]: ActiveComponentSchema[K] }>
  getActiveEntities(): Set<Entity>
}

export interface System {
  readonly name: string
  readonly priority?: number

  run(ecs: ECS): Promise<void>

  init?(ecs: ECS): Promise<void>
  shutdown?(ecs: ECS): Promise<void>
}

export abstract class InitializableSystem implements System {
  abstract readonly name: string

  private initialized = false

  public async init(ecs: ECS): Promise<void> {
    if (this.initialized) {
      this.logger.errorAndThrow(`Cannot initialize ${this.name} system; system already initialized`)
    }

    this.onInit(ecs)
  }

  public async dispose(ecs: ECS): Promise<void> {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot dispose of ${this.name} system; system not initialized`)
    }

    this.onDispose(ecs)
  }

  public async run(ecs: ECS): Promise<void> {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot run ${this.name} system; system not initialized`)
    }

    this.onRun(ecs)
  }

  protected abstract logger: Logger
  protected abstract onInit(ecs: ECS): Promise<void>
  protected abstract onDispose(ecs: ECS): Promise<void>
  protected abstract onRun(ecs: ECS): Promise<void>
}

export interface EcsState {
  [entityId: number]: Partial<ActiveComponentSchema>
}

export interface EcsStateEnvelopeMeta {
  gameId: string
  engineVersion: string
  gameVersion: string
  savedAt: number // ms from epoch
}

export interface EcsStateEnvelope {
  metadata: EcsStateEnvelopeMeta
  state: EcsState
}


