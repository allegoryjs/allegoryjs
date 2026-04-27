import type { Entity, EngineComponentSchema, ReadonlyFacade, System } from '@/ecs/ecs.types'
import { DefaultLogger } from '@/logger/logger'
import type { Logger } from '@/logger/logger.types'
import deepFreeze from '@/utilities/deepFreeze/deepFreeze'

export default class ECS<
  ComponentSchema extends EngineComponentSchema & Record<string, any> = EngineComponentSchema,
> {
  #nextEntityId = 1
  #activeEntities = new Set<number>()
  #components = new Map<
    keyof ComponentSchema & string,
    Map<Entity, ComponentSchema[keyof ComponentSchema]>
  >()

  #systems = new Map<string, System<ComponentSchema>>()
  #prettyIdMap = new Map<string, Entity>()
  #logger: Logger
  #defaultSystemPriority: number

  constructor(logger?: Logger, defaultSystemPriority = 50) {
    this.#logger = logger ?? new DefaultLogger()

    // Bootstrap the required system components
    this.#components.set('Tags', new Map())
    this.#components.set('Meta', new Map())
    this.#logger.debug('ECS initialized with built-in Tags and Meta components')
    this.#defaultSystemPriority = defaultSystemPriority
  }

  /**
   * Array of Systems, sorted by priority order
   */
  get systems(): readonly System<ComponentSchema>[] {
    return deepFreeze(
      [...this.#systems.values()].toSorted(
        (a, b) =>
          (a.priority ?? this.#defaultSystemPriority) - (b.priority ?? this.#defaultSystemPriority),
      ),
    )
  }

  #assertEntityExists(entity: Entity, entityOperation: string) {
    if (!this.#activeEntities.has(entity)) {
      if (entity < 1 || entity >= this.#nextEntityId) {
        throw new Error(`Can't ${entityOperation} entity ${entity}; entity does not exist`)
      }

      throw new Error(`Can't ${entityOperation} entity ${entity}; entity is destroyed`)
    }
  }

  isComponent(name: string): name is keyof ComponentSchema & string {
    const result = this.#components.has(name)
    this.#logger.debug(`isComponent("${name}"): ${result}`)
    return result
  }

  defineComponent<ComponentName extends keyof ComponentSchema & string>(name: ComponentName) {
    if (this.#components.has(name)) {
      throw new Error(`Component named ${String(name)} already exists`)
    }

    this.#components.set(name, new Map())
    this.#logger.info(`Component "${name}" defined`)

    return name
  }

  createEntity(metaId?: string) {
    if (metaId && this.#prettyIdMap.has(metaId)) {
      throw new Error(
        `Cannot register new entity with pretty ID ${metaId}; entity ${this.#prettyIdMap.get(metaId)} is already assigned that ID`,
      )
    }
    const id = this.#nextEntityId++

    this.#activeEntities.add(id)
    this.#logger.debug(`Entity ${id} added to active set`)

    const metaIdToSet = metaId || `entity_${id}`

    this.setComponentOnEntity(id, 'Tags', { list: new Set<string>() })
    this.setComponentOnEntity(id, 'Meta', {
      name: `Entity_${id}`,
      id: metaIdToSet,
      created: Date.now(),
    })
    this.#prettyIdMap.set(metaIdToSet, id)

    this.#logger.info(`Entity ${id} created (metaId: "${metaIdToSet}")`)

    return id
  }

  registerSystem(system: System<ComponentSchema>) {
    const { name } = system

    if (this.#systems.has(name)) {
      const err = `Cannot register system: system with name ${name} is already registered`

      this.#logger.error(err)
      throw new Error(err)
    }

    this.#systems.set(name, system)
    this.#logger.info(`System ${name} has been registered`)
  }

  deregisterSystem(systemName: string) {
    if (!this.#systems.has(systemName)) {
      const err = `Cannot deregister system: system with name ${systemName} is not registered`

      this.#logger.error(err)
      throw new Error(err)
    }

    this.#systems.delete(systemName)
    this.#logger.info(`System ${systemName} has been deregistered`)
  }

  // destructive; overwrites existing component data, if any
  setComponentOnEntity<ComponentName extends keyof ComponentSchema & string>(
    entity: number,
    name: ComponentName,
    data: ComponentSchema[ComponentName],
  ): void {
    const store = this.#components.get(name)

    if (!store) {
      throw new Error(`Can't set component on entity ${entity}; unknown component type: ${name}`)
    }

    this.#assertEntityExists(entity, 'set component on')

    const isOverwrite = store.has(entity)
    store.set(entity, data)
    this.#logger.debug(
      `${isOverwrite ? 'Overwrote' : 'Set'} component "${name}" on entity ${entity}`,
    )
  }

  // merge component data with new data
  updateComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
    data: Partial<ComponentSchema[ComponentName]>,
  ) {
    this.#assertEntityExists(entity, 'update component data on')

    const store = this.#components.get(name)

    if (!store) {
      throw new Error(
        `Can't update component data for entity ${entity}; Unknown component type: ${name}`,
      )
    }

    const existingComponentData = store.get(entity)

    if (!existingComponentData) {
      throw new Error(
        `Can't update component data for entity ${entity}; entity does not have component ${name}`,
      )
    }

    this.#logger.debug(
      `Merging component "${name}" data on entity ${entity}: ${JSON.stringify(data)}`,
    )

    store.set(entity, {
      ...existingComponentData,
      ...data,
    })
  }

  removeComponentFromEntity<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentType: ComponentName,
  ) {
    this.#assertEntityExists(entity, 'remove component from')

    const store = this.#components.get(componentType)

    if (!store) {
      throw new Error(
        `Can't remove component from entity ${entity}; unknown component type: ${componentType}`,
      )
    }

    store.delete(entity)
    this.#logger.debug(`Removed component "${componentType}" from entity ${entity}`)
  }

  getEntityComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
  ): Readonly<ComponentSchema[ComponentName]> {
    this.#assertEntityExists(entity, 'get component data for')

    const store = this.#components.get(name)
    const componentData = store?.get(entity)

    if (!store || !componentData) {
      throw new Error(
        `Can't get component data for entity ${entity}; entity does not have component ${name}`,
      )
    }

    this.#logger.debug(`Retrieved component "${name}" data for entity ${entity}`)

    return deepFreeze(componentData)
  }

  entityHasComponent<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentType: ComponentName,
  ) {
    this.#assertEntityExists(entity, 'check for component presence on')

    const component = this.#components.get(componentType)

    if (!component) {
      throw new Error(
        `Can't check for component presence on entity ${entity}; component ${componentType} does not exist`,
      )
    }
    const result = component.has(entity)
    this.#logger.debug(`entityHasComponent(${entity}, "${componentType}"): ${result}`)
    return result
  }

  getComponentsOnEntity<ComponentName extends keyof ComponentSchema>(
    entity: Entity,
  ): ComponentName[] {
    this.#assertEntityExists(entity, 'get components on')

    const components = Array.from(this.#components).flatMap(([componentName]) =>
      this.entityHasComponent(entity, componentName) ? [componentName as ComponentName] : [],
    )
    this.#logger.debug(`Components on entity ${entity}: [${components.join(', ')}]`)
    return components
  }

  getEntitiesByComponents<ComponentName extends keyof ComponentSchema & string>(
    ...componentTypes: ComponentName[]
  ): Entity[] {
    if (componentTypes.length === 0) return []

    this.#logger.debug(`Querying entities by components: [${componentTypes.join(', ')}]`)

    if (!componentTypes.every((type) => this.isComponent(type))) {
      const missingTypes = componentTypes.filter((type) => !this.isComponent(type))
      throw new Error(
        `Cannot get entities by component: given components ${missingTypes.join(', ')} do not exist`,
      )
    }

    const sortedTypes = componentTypes.toSorted((a, b) => {
      return (this.#components.get(a)?.size ?? 0) - (this.#components.get(b)?.size ?? 0)
    })

    const [smallestType, ...rest] = sortedTypes

    if (!smallestType) {
      throw new Error('Failed to sort component types')
    }
    const smallestStore = this.#components.get(smallestType)

    if (!smallestStore || smallestStore.size === 0) return []

    this.#logger.debug(
      `Using "${smallestType}" as smallest store (size: ${smallestStore.size}) for intersection`,
    )

    const result: Entity[] = []

    for (const entity of smallestStore.keys()) {
      const hasAll = rest.every((type) => this.entityHasComponent(entity, type))
      if (hasAll) result.push(entity)
    }

    this.#logger.debug(`Query result: [${result.join(', ')}] (${result.length} entities)`)

    return result
  }

  destroyEntity(entity: Entity) {
    this.#assertEntityExists(entity, 'destroy')

    const prettyId = this.getEntityComponentData(entity, 'Meta').id
    this.#logger.debug(`Destroying entity ${entity}; clearing all component data`)

    for (const store of this.#components.values()) {
      store.delete(entity)
    }

    this.#activeEntities.delete(entity)
    this.#prettyIdMap.delete(prettyId)
    this.#logger.info(`Entity ${entity} destroyed`)
  }

  addTagToEntity(entity: Entity, tag: string) {
    this.#assertEntityExists(entity, 'add tag to')

    const store = this.#components.get('Tags')
    const tagData = store?.get(entity) as EngineComponentSchema['Tags']

    if (tagData) {
      tagData.list.add(tag)
      this.#logger.debug(`Added tag "${tag}" to entity ${entity}`)
    }
  }

  entityHasTag(entity: Entity, tag: string) {
    this.#assertEntityExists(entity, 'check for tags on')

    const tagData = this.getEntityComponentData(entity, 'Tags')
    const result = tagData?.list.has(tag) ?? false
    this.#logger.debug(`entityHasTag(${entity}, "${tag}"): ${result}`)
    return result
  }

  getEntityByPrettyId(id: string) {
    const entity = this.#prettyIdMap.get(id)
    this.#logger.debug(`getEntityByPrettyId("${id}"): ${entity ?? 'not found'}`)
    return entity
  }

  entityExists(id: number) {
    const result = this.#activeEntities.has(id)
    this.#logger.debug(`entityExists(${id}): ${result}`)
    return result
  }

  getReadonlyFacade(): ReadonlyFacade<ComponentSchema> {
    this.#logger.debug('Creating readonly facade')
    return {
      entityExists: this.entityExists.bind(this),
      entityHasTag: this.entityHasTag.bind(this),
      entityHasComponent: this.entityHasComponent.bind(this),
      getEntitiesByComponents: this.getEntitiesByComponents.bind(this),
      getComponentsOnEntity: this.getComponentsOnEntity.bind(this),
      getEntityComponentData: this.getEntityComponentData.bind(this),
      getEntityByPrettyId: this.getEntityByPrettyId.bind(this),
    }
  }
}
