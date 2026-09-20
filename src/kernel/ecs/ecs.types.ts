import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { SemanticCacheData } from '@/kernel/ecs/systems/semantic-cache/semantic-cache.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

export type Entity = number

export const ENGINE_COMPONENT_SCHEMA_COMPONENTS = {
  tags: 'Tags',
  meta: 'Meta',
  noun: 'Noun',
  semanticCache: 'SemanticCache',
} as const

export const MANDATORY_COMPONENTS = [
  ENGINE_COMPONENT_SCHEMA_COMPONENTS.tags,
  ENGINE_COMPONENT_SCHEMA_COMPONENTS.meta,
] as const

export type MandatoryComponent = typeof MANDATORY_COMPONENTS[number]

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
}

export interface ComponentRegistrationOptions {
  /**
   * Whether the component data should be serialized when exporting ECS state.
   * Set to false for data which can be derived at engine init, to reduce the size of save files.
   *
   * @default true
   */
  serialize?: boolean
}

export interface EcsReadonlyFacade<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
> {
  entityExists(entity: Entity): boolean
  entityHasComponent<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentName: ComponentName,
  ): boolean
  getEntityByPrettyId(prettyId: string): Entity | undefined
  getComponentsOnEntity(entity: Entity): Set<keyof ComponentSchema & string>
  getEntitiesByComponents<ComponentName extends keyof ComponentSchema & string>(
    ...componentTypes: ComponentName[]
  ): Set<Entity>
  getEntityComponentData<ComponentName extends MandatoryComponent>(
    entity: Entity,
    name: ComponentName,
  ): ComponentSchema[ComponentName]
  getEntityComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
  ): ComponentSchema[ComponentName] | undefined
  getAllEntityComponentData(
    entity: Entity,
  ): Partial<{ [K in keyof ComponentSchema & string]: ComponentSchema[K] }>
  getActiveEntities(): Set<Entity>
}

export interface System<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
> {
  readonly name: string
  readonly priority?: number

  run(ecs: ECS<ComponentSchema>): Promise<void>

  init?(ecs: ECS<ComponentSchema>): Promise<void>
  shutdown?(ecs: ECS<ComponentSchema>): Promise<void>
}

export abstract class InitializableSystem<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
> implements System<ComponentSchema> {
  abstract readonly name: string

  private initialized = false

  public async init(ecs: ECS<ComponentSchema>): Promise<void> {
    if (this.initialized) {
      this.logger.errorAndThrow(`Cannot initialize ${this.name} system; system already initialized`)
    }

    this.onInit(ecs)
  }

  public async dispose(ecs: ECS<ComponentSchema>): Promise<void> {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot dispose of ${this.name} system; system not initialized`)
    }

    this.onDispose(ecs)
  }

  public async run(ecs: ECS<ComponentSchema>): Promise<void> {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot run ${this.name} system; system not initialized`)
    }

    this.onRun(ecs)
  }

  protected abstract logger: Logger
  protected abstract onInit(ecs: ECS<ComponentSchema>): Promise<void>
  protected abstract onDispose(ecs: ECS<ComponentSchema>): Promise<void>
  protected abstract onRun(ecs: ECS<ComponentSchema>): Promise<void>
}

export interface EcsState<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
> {
  [entityId: number]: EngineComponentSchema & Partial<ComponentSchema>
}

export interface EcsStateEnvelopeMeta {
  gameId: string
  engineVersion: string
  gameVersion: string
  savedAt: number // ms from epoch
}

export interface EcsStateEnvelope<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
> {
  metadata: EcsStateEnvelopeMeta
  state: EcsState<ComponentSchema>
}
