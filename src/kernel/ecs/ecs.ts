import type EventBus from '@/helpers/event-bus/event-bus'
import { defaultEmitStreams } from '@/helpers/event-bus/event-bus'
import type { DefaultEventMap } from '@/helpers/event-bus/event-bus.types'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import { parseStateJson } from '@/kernel/ecs/ecs.helpers'
import {
  type Entity,
  type EngineComponentSchema,
  type EcsReadonlyFacade,
  type System,
  ENGINE_COMPONENT_SCHEMA_COMPONENTS,
  type EcsStateEnvelopeMeta,
  type EcsStateEnvelope,
  type EcsState,
  type ComponentRegistrationOptions,
  type MandatoryComponent,
} from '@/kernel/ecs/ecs.types'
import deepFreeze from '@/utilities/deep-freeze'
import type { POJO } from '@/utilities/schemer/schemer.types'

export default class ECS<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
  EventMapType extends DefaultEventMap<ComponentSchema> = DefaultEventMap<ComponentSchema>,
> {
  #nextEntityId = 1
  #activeEntities = new Set<number>()
  #components = new Map<
    keyof ComponentSchema & string,
    Map<Entity, ComponentSchema[keyof ComponentSchema & string]>
  >()
  #prettyIdMap = new Map<string, Entity>()
  #nonSerializedComponents = new Set<keyof ComponentSchema & string>()

  #systems = new Map<string, System<ComponentSchema>>()
  #logger: Logger
  #eventBus: EventBus<ComponentSchema, EventMapType>
  #defaultSystemPriority: number
  #readonlyFacade: EcsReadonlyFacade<ComponentSchema> | undefined

  constructor(
    eventBus: EventBus<ComponentSchema, EventMapType>,
    logger?: Logger,
    defaultSystemPriority = 50,
  ) {
    this.#logger = logger ?? new DefaultLogger()
    this.#eventBus = eventBus

    // Bootstrap the required system components
    this.#components.set(ENGINE_COMPONENT_SCHEMA_COMPONENTS.tags, new Map())
    this.#components.set(ENGINE_COMPONENT_SCHEMA_COMPONENTS.meta, new Map())
    this.#components.set(ENGINE_COMPONENT_SCHEMA_COMPONENTS.noun, new Map())
    this.#logger.debug('ECS initialized with built-in Tags, Meta, and Noun components')

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

  get readonlyFacade(): EcsReadonlyFacade<ComponentSchema> {
    if (!this.#readonlyFacade) {
      this.#logger.debug('Creating readonly facade')
      this.#readonlyFacade = deepFreeze({
        entityExists: this.entityExists.bind(this),
        entityHasComponent: this.entityHasComponent.bind(this),
        getEntitiesByComponents: this.getEntitiesByComponents.bind(this),
        getComponentsOnEntity: this.getComponentsOnEntity.bind(this),
        getEntityComponentData: this.getEntityComponentData.bind(this),
        getEntityByPrettyId: this.getEntityByPrettyId.bind(this),
        getActiveEntities: this.getActiveEntities.bind(this),
        getAllEntityComponentData: this.getAllEntityComponentData.bind(this),
      })
    }

    return this.#readonlyFacade
  }

  #assertEntityExists(entity: Entity, entityOperation: string) {
    if (!this.#activeEntities.has(entity)) {
      if (entity < 1 || entity >= this.#nextEntityId) {
        const err = `Can't ${entityOperation} entity ${entity}; entity does not exist`
        this.#logger.errorAndThrow(err)
      }

      const err = `Can't ${entityOperation} entity ${entity}; entity is destroyed`
      this.#logger.errorAndThrow(err)
    }
  }

  loadSerializedState(
    stateString: string,
    validateMetadata: (meta: EcsStateEnvelopeMeta) => boolean,
  ): void {
    const components: Map<
      keyof ComponentSchema & string,
      Map<Entity, ComponentSchema[keyof ComponentSchema & string]>
    > = new Map()
    const prettyIdMap: Map<string, Entity> = new Map()
    let activeEntities: Entity[] = []
    let nextEntityId: Entity = 1

    const { metadata, state } = parseStateJson(stateString)

    if (!validateMetadata(metadata)) {
      throw new Error('Fatal error loading serialized state: invalid metadata')
    }

    for (const [entityString, entityComponents] of Object.entries(state)) {
      const entityId = Number(entityString)
      const entityComponentsTyped = entityComponents as EngineComponentSchema &
        Partial<ComponentSchema>

      activeEntities.push(entityId)
      if (nextEntityId <= entityId) nextEntityId = entityId + 1

      prettyIdMap.set(entityComponentsTyped.Meta.id, entityId)

      for (const [componentName, componentData] of Object.entries(entityComponentsTyped)) {
        const componentMap = components.getOrInsert(componentName, new Map())
        componentMap.set(entityId, componentData)
      }
    }

    this.#nextEntityId = nextEntityId
    this.#activeEntities = new Set(activeEntities)
    this.#components = components
    this.#prettyIdMap = prettyIdMap

    this.#logger.info('ECS successfully hydrated with serialized state')
  }

  exportSerializedState(metadata: EcsStateEnvelopeMeta): string {
    const state: Record<Entity, POJO> = {}

    for (const [componentName, entityMap] of this.#components.entries()) {
      if (this.#nonSerializedComponents.has(componentName)) {
        continue
      }

      for (const [entity, componentData] of entityMap.entries()) {
        if (!state[entity]) {
          state[entity] = {}
        }
        state[entity][componentName] = componentData
      }
    }

    const data: EcsStateEnvelope<ComponentSchema> = {
      metadata,
      state: state as EcsState<ComponentSchema>,
    }

    return JSON.stringify(data)
  }

  isComponent(name: string): name is keyof ComponentSchema & string {
    const result = this.#components.has(name)
    this.#logger.debug(`isComponent("${name}"): ${result}`)
    return result
  }

  registerComponent(
    name: keyof ComponentSchema & string,
    { serialize }: ComponentRegistrationOptions = { serialize: true }
  ) {
    if (this.#components.has(name)) {
      const err = `Error registering component ${String(name)}: a component by that name is already registered`
      this.#logger.errorAndThrow(err)
    }

    if (!serialize) {
      this.#nonSerializedComponents.add(name)
    }

    this.#components.set(name, new Map())
    this.#logger.info(`Component "${name}" registered`)

    return name
  }

  deregisterComponent(name: keyof ComponentSchema & string) {
    if (!this.#components.has(name)) {
      const err = `Error deregistering component ${name}: no component by that name is registered`
      this.#logger.errorAndThrow(err)
    }

    this.#components.delete(name)
    this.#logger.info(`Component "${name}" deregistered`)
  }

  createEntity(metaId?: string, noun?: string) {
    if (metaId && this.#prettyIdMap.has(metaId)) {
      const err = `Cannot register new entity with pretty ID ${metaId}; entity ${this.#prettyIdMap.get(metaId)} is already assigned that ID`
      this.#logger.errorAndThrow(err)
    }
    const id = this.#nextEntityId++

    this.#activeEntities.add(id)
    this.#logger.debug(`Entity ${id} added to active set`)

    const metaIdToSet = metaId || `entity_${id}`

    this.setComponentOnEntity(id, ENGINE_COMPONENT_SCHEMA_COMPONENTS.tags, {
      list: Array.from({ length: 0 }) as Array<string>,
    })
    this.setComponentOnEntity(id, ENGINE_COMPONENT_SCHEMA_COMPONENTS.meta, {
      name: `Entity_${id}`,
      id: metaIdToSet,
      created: Date.now(),
    })
    this.#prettyIdMap.set(metaIdToSet, id)

    if (noun) {
      this.setComponentOnEntity(id, ENGINE_COMPONENT_SCHEMA_COMPONENTS.noun, { noun })
      this.#logger.debug(`Set noun ${noun} on entity ${id}`)
    }

    this.#logger.info(`Entity ${id} created (metaId: "${metaIdToSet}")`)

    return id
  }

  registerSystem(system: System<ComponentSchema>) {
    const { name } = system

    if (this.#systems.has(name)) {
      const err = `Cannot register system: system with name ${name} is already registered`

      this.#logger.errorAndThrow(err)
    }

    this.#systems.set(name, system)
    this.#logger.info(`System ${name} has been registered`)
  }

  deregisterSystem(systemName: string) {
    if (!this.#systems.has(systemName)) {
      const err = `Cannot deregister system: system with name ${systemName} is not registered`

      this.#logger.errorAndThrow(err)
    }

    this.#systems.delete(systemName)
    this.#logger.info(`System ${systemName} has been deregistered`)
  }

  // destructive; overwrites existing component data, if any
  setComponentOnEntity<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
    data: ComponentSchema[ComponentName],
  ): void {
    const systemComponents: readonly string[] = Object.values(ENGINE_COMPONENT_SCHEMA_COMPONENTS)
    if (systemComponents.includes(name)) {
      this.#logger.warn(
        `Setting component ${name} on entity ${entity}; component is a system component, and modifying its data may result in unexpected behavior.`,
      )
    }

    const store = this.#components.get(name)

    if (!store) {
      const err = `Can't set component on entity ${entity}; unknown component type: ${name}`
      this.#logger.errorAndThrow(err)
    }

    this.#assertEntityExists(entity, 'set component on')

    store.set(entity, structuredClone(data))
    this.#logger.debug(`Set component "${name}" data on entity ${entity}: ${JSON.stringify(data)}`)

    this.#eventBus.emit(defaultEmitStreams.ecsComponentModified, { entity, component: name })
  }

  // merge component data with new data
  updateComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
    data: Partial<ComponentSchema[ComponentName]>,
  ) {
    const systemComponents: readonly string[] = Object.values(ENGINE_COMPONENT_SCHEMA_COMPONENTS)
    if (systemComponents.includes(name)) {
      this.#logger.warn(
        `Updating data for component ${name} for entity ${entity}: component is a system component, and modifying its data may result in unexpected behavior.`,
      )
    }

    this.#assertEntityExists(entity, 'update component data on')

    const store = this.#components.get(name)

    if (!store) {
      const err = `Can't update component data for entity ${entity}; Unknown component type: ${name}`
      this.#logger.errorAndThrow(err)
    }

    const existingComponentData = store.get(entity)

    if (!existingComponentData) {
      const err = `Can't update component data for entity ${entity}; entity does not have component ${name}`
      this.#logger.errorAndThrow(err)
    }

    this.#logger.debug(
      `Merging component "${name}" data on entity ${entity}: ${JSON.stringify(data)}`,
    )

    store.set(entity, {
      ...existingComponentData,
      ...data,
    })

    this.#eventBus.emit(defaultEmitStreams.ecsComponentModified, { entity, component: name })
  }

  removeComponentFromEntity<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentType: ComponentName,
  ) {
    const systemComponents: readonly string[] = Object.values(ENGINE_COMPONENT_SCHEMA_COMPONENTS)
    if (systemComponents.includes(componentType)) {
      this.#logger.warn(
        `Removing component ${componentType} from entity ${entity}: component is a system component, and modifying its data may result in unexpected behavior.`,
      )
    }

    this.#assertEntityExists(entity, 'remove component from')

    const store = this.#components.get(componentType)

    if (!store) {
      const err = `Can't remove component from entity ${entity}; unknown component type: ${componentType}`
      this.#logger.errorAndThrow(err)
    }

    store.delete(entity)
    this.#eventBus.emit(defaultEmitStreams.ecsComponentModified, {
      entity,
      component: componentType,
    })
    this.#logger.debug(`Removed component "${componentType}" from entity ${entity}`)
  }

  getAllEntityComponentData(entity: Entity): Partial<{
    [ComponentName in keyof ComponentSchema & string]: ComponentSchema[ComponentName]
  }> {
    this.#assertEntityExists(entity, 'get component data for')

    const data: Partial<{
      [ComponentName in keyof ComponentSchema & string]: ComponentSchema[ComponentName]
    }> = {}

    const components = this.getComponentsOnEntity(entity)

    components.forEach((component) => {
      data[component] = this.getEntityComponentData(entity, component)
    })

    return data
  }

  getEntityComponentData<ComponentName extends MandatoryComponent>(
    entity: Entity,
    name: ComponentName,
  ): ComponentSchema[ComponentName]
  getEntityComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
  ): ComponentSchema[ComponentName] | undefined
  getEntityComponentData<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    name: ComponentName,
  ): ComponentSchema[ComponentName] | undefined {
    this.#assertEntityExists(entity, 'get component data for')

    const store = this.#components.get(name)
    const componentData = store?.get(entity)

    if (!store || !componentData) {
      const err = `Can't get component data for entity ${entity}; entity does not have component ${name}`
      this.#logger.errorAndThrow(err)
    }

    this.#logger.debug(`Retrieved component "${name}" data for entity ${entity}`)

    return structuredClone(componentData as ComponentSchema[ComponentName])
  }

  entityHasComponent<ComponentName extends keyof ComponentSchema & string>(
    entity: Entity,
    componentType: ComponentName,
  ): boolean {
    this.#assertEntityExists(entity, 'check for component presence on')

    const component = this.#components.get(componentType)

    if (!component) {
      const err = `Can't check for component presence on entity ${entity}; component ${componentType} does not exist`
      this.#logger.errorAndThrow(err)
    }
    const result = component.has(entity)
    this.#logger.debug(`entityHasComponent(${entity}, "${componentType}"): ${result}`)
    return result
  }

  getComponentsOnEntity(entity: Entity): Set<keyof ComponentSchema & string> {
    this.#assertEntityExists(entity, 'get components on')

    const components = Array.from(this.#components).flatMap(([componentName]) =>
      this.entityHasComponent(entity, componentName as keyof ComponentSchema & string)
        ? [componentName as keyof ComponentSchema & string]
        : [],
    )
    this.#logger.debug(`Components on entity ${entity}: [${components.join(', ')}]`)
    return new Set(components)
  }

  getEntitiesByComponents<ComponentName extends keyof ComponentSchema & string>(
    ...componentTypes: ComponentName[]
  ): Set<Entity> {
    if (componentTypes.length === 0) return new Set()

    this.#logger.debug(`Querying entities by components: [${componentTypes.join(', ')}]`)

    if (!componentTypes.every((type) => this.isComponent(type))) {
      const missingTypes = componentTypes.filter((type) => !this.isComponent(type))
      const err = `Cannot get entities by component: given components ${missingTypes.join(', ')} do not exist`
      this.#logger.errorAndThrow(err)
    }

    const sortedTypes = componentTypes.toSorted((a, b) => {
      return (this.#components.get(a)?.size ?? 0) - (this.#components.get(b)?.size ?? 0)
    })

    const [smallestType, ...rest] = sortedTypes

    if (!smallestType) {
      const err = 'Failed to sort component types'
      this.#logger.errorAndThrow(err)
    }
    const smallestStore = this.#components.get(smallestType)

    if (!smallestStore || smallestStore.size === 0) return new Set()

    this.#logger.debug(
      `Using "${smallestType}" as smallest store (size: ${smallestStore.size}) for intersection`,
    )

    const result: Entity[] = []

    for (const entity of smallestStore.keys()) {
      const hasAll = rest.every((type) => this.entityHasComponent(entity, type))
      if (hasAll) result.push(entity)
    }

    this.#logger.debug(`Query result: [${result.join(', ')}] (${result.length} entities)`)

    return new Set(result)
  }

  destroyEntity(entity: Entity) {
    this.#assertEntityExists(entity, 'destroy')

    const prettyId = this.getEntityComponentData(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.meta)?.id

    if (!prettyId) {
      const err = `Critical error: Attempting to destroy entity ${entity}, but it has no pretty ID. All entities must have the Meta component and a pretty ID.`
      this.#logger.errorAndThrow(err)
    }

    this.#logger.debug(`Destroying entity ${entity}; clearing all component data`)

    for (const store of this.#components.values()) {
      store.delete(entity)
    }

    this.#activeEntities.delete(entity)
    this.#prettyIdMap.delete(prettyId)
    this.#logger.info(`Entity ${entity} destroyed`)
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

  getActiveEntities() {
    return structuredClone(this.#activeEntities)
  }
}
