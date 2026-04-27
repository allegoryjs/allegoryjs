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

export interface ReadonlyFacade<ComponentSchema> {
  entityExists(entity: Entity): boolean
  entityHasTag(entity: Entity, tag: string): boolean
  entityHasComponent<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentName: ComponentName,
  ): boolean
  getEntityByPrettyId(prettyId: string): Entity | undefined
  getComponentsOnEntity<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
  ): ComponentName[]
  getEntitiesByComponents<ComponentName extends keyof ComponentSchema & string>(
    ...componentTypes: ComponentName[]
  ): Entity[]
  getEntityComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
  ): Readonly<ComponentSchema[ComponentName]>
}

export interface System<ComponentSchema> {
  readonly name: string
  readonly priority?: number
  run(ecs: ReadonlyFacade<ComponentSchema>): Promise<void>
}
