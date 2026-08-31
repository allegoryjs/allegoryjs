export type Entity = number

export interface EngineComponentSchema {
  Tags: {
    list: Set<string>
  }

  Meta: {
    name: string
    created: number // ms since epoch

    // pretty ID set by the developer; not to be confused
    // with the entity ID, which is an integer
    id: string
  }
}

export interface EcsReadonlyFacade<
  ComponentSchema extends EngineComponentSchema & Record<string, any> = EngineComponentSchema
> {
  entityExists(entity: Entity): boolean
  entityHasTag(entity: Entity, tag: string): boolean
  entityHasComponent<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentName: ComponentName,
  ): boolean
  getEntityByPrettyId(prettyId: string): Entity | undefined
  getComponentsOnEntity(
    entity: Entity,
  ): Set<(keyof ComponentSchema & string)>
  getEntitiesByComponents<ComponentName extends keyof ComponentSchema & string>(
    ...componentTypes: ComponentName[]
  ): Set<Entity>
  getEntityComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
  ): Readonly<ComponentSchema[ComponentName]>
  getActiveEntities(): Set<Entity>
}

export interface System<ComponentSchema extends EngineComponentSchema & Record<string, any> = EngineComponentSchema> {
  readonly name: string
  readonly priority?: number
  run(ecs: EcsReadonlyFacade<ComponentSchema>): Promise<void>
}
