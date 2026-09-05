export type Entity = number

export interface EngineComponentSchema {
  // all entities have this component
  Tags: {
    list: Set<string>
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
}

export interface EcsReadonlyFacade<
  ComponentSchema extends EngineComponentSchema & Record<string, any> = EngineComponentSchema,
> {
  entityExists(entity: Entity): boolean
  entityHasTag(entity: Entity, tag: string): boolean
  entityHasComponent<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentName: ComponentName,
  ): boolean
  getEntityByPrettyId(prettyId: string): Entity | undefined
  getComponentsOnEntity(entity: Entity): Set<keyof ComponentSchema & string>
  getEntitiesByComponents<ComponentName extends keyof ComponentSchema & string>(
    ...componentTypes: ComponentName[]
  ): Set<Entity>
  getEntityComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
  ): Readonly<ComponentSchema[ComponentName]>
  getActiveEntities(): Set<Entity>
  getNounOnEntity(entity: Entity): string | null
  getEntitiesByNoun(noun: string): Set<Entity>
}

export interface System<
  ComponentSchema extends EngineComponentSchema & Record<string, any> = EngineComponentSchema,
> {
  readonly name: string
  readonly priority?: number
  run(ecs: EcsReadonlyFacade<ComponentSchema>): Promise<void>
}
