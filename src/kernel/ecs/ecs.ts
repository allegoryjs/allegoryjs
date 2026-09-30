import type { EngineContext } from '@/engine/engine.types'
import { parseStateJson } from '@/kernel/ecs/ecs.helpers'
import {
  type Entity,
  type EngineComponentSchema,
  type EcsReadonlyFacade,
  type System,
  SYSTEM_SCHEMA_COMPONENTS,
  type EcsStateEnvelopeMeta,
  type EcsStateEnvelope,
  type EcsState,
  type ComponentRegistrationOptions,
  type MandatoryComponent,
  type ComponentName,
  type ActiveComponentSchema,
  type Revision,
  type EcsConfig,
  ECS,
} from '@/kernel/ecs/ecs.types'
import deepFreeze from '@/utilities/deep-freeze'
import type { POJO } from '@/utilities/schemer/schemer.types'

export default class DefaultECS extends ECS {
  #nextEntityId = 1
  #revision = 0
  #activeEntities = new Set<number>()
  #components = new Map<ComponentName, Map<Entity, ActiveComponentSchema[ComponentName]>>()
  #entityRevisions = new Map<Entity, Map<ComponentName, Revision>>()
  #prettyIdMap = new Map<string, Entity>()
  #nonSerializedComponents = new Set<ComponentName>()

  #systems = new Map<string, System>()
  #defaultSystemPriority: number
  #readonlyFacade: EcsReadonlyFacade | undefined

  constructor(ctx: EngineContext, config: EcsConfig) {
    super(ctx, config)

    const { defaultSystemPriority = 50 } = config

    // Bootstrap required system components
    this.#components.set(SYSTEM_SCHEMA_COMPONENTS.tags, new Map())
    this.#components.set(SYSTEM_SCHEMA_COMPONENTS.meta, new Map())
    this.#components.set(SYSTEM_SCHEMA_COMPONENTS.noun, new Map())
    this.ctx.logger.debug('ECS initialized with built-in Tags, Meta, and Noun components')

    this.#defaultSystemPriority = defaultSystemPriority
  }

  /**
   * Array of Systems, sorted by priority order
   */
  get systems(): readonly System[] {
    return deepFreeze(
      [...this.#systems.values()].toSorted(
        (a, b) =>
          (a.priority ?? this.#defaultSystemPriority) - (b.priority ?? this.#defaultSystemPriority),
      ),
    )
  }

  get readonlyFacade(): EcsReadonlyFacade {
    if (!this.#readonlyFacade) {
      this.ctx.logger.debug('Creating readonly facade')

      this.#readonlyFacade = deepFreeze({
        entityExists: this.entityExists.bind(this),
        entityHasComponent: this.entityHasComponent.bind(this),
        getEntitiesByComponents: this.getEntitiesByComponents.bind(this),
        getComponentsOnEntity: this.getComponentsOnEntity.bind(this),
        getEntityComponentData: this.getEntityComponentData.bind(this),
        getEntityByPrettyId: this.getEntityByPrettyId.bind(this),
        getActiveEntities: this.getActiveEntities.bind(this),
        getAllEntityComponentData: this.getAllEntityComponentData.bind(this),
        getEntityComponentRevision: this.getEntityComponentRevision.bind(this),
        getDirtyEntitiesByComponentRevision: this.getDirtyEntitiesByComponentRevision.bind(this),
      })
    }

    return this.#readonlyFacade
  }

  get currentRevision(): Revision {
    return this.#revision
  }

  #assertEntityExists(entity: Entity, entityOperation: string) {
    if (!this.#activeEntities.has(entity)) {
      if (entity < 1 || entity >= this.#nextEntityId) {
        const err = `Can't ${entityOperation} entity ${entity}; entity does not exist`
        this.ctx.logger.errorAndThrow(err)
      }

      const err = `Can't ${entityOperation} entity ${entity}; entity is destroyed`
      this.ctx.logger.errorAndThrow(err)
    }
  }

  #incrementRevision(): void
  #incrementRevision(entity: Entity, component: ComponentName): void
  #incrementRevision(entity?: Entity, component?: ComponentName) {
    this.#revision++

    if (typeof entity === 'undefined' || typeof component === 'undefined') {
      return
    }

    const componentRevisionsMap = this.#entityRevisions.getOrInsert(entity, new Map())
    componentRevisionsMap.set(component, this.#revision)

    this.ctx.logger.debug(`Incrementing ECS revision to ${this.#revision}`)
    this.ctx.logger.silly`Updated entity ${entity} -> component ${component} last modified revision version to ${this.#revision}`
  }

  loadSerializedState(
    stateString: string,
    validateMetadata: (meta: EcsStateEnvelopeMeta) => boolean,
  ): void {
    const components: Map<
      ComponentName,
      Map<Entity, ActiveComponentSchema[ComponentName]>
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
        Partial<ActiveComponentSchema>

      activeEntities.push(entityId)
      if (nextEntityId <= entityId) nextEntityId = entityId + 1

      prettyIdMap.set(entityComponentsTyped.Meta.id, entityId)

      for (const [componentName, componentData] of Object.entries(entityComponentsTyped)) {
        const componentMap = components.getOrInsert(componentName as ComponentName, new Map())
        componentMap.set(entityId, componentData)
      }
    }

    this.#nextEntityId = nextEntityId
    this.#activeEntities = new Set(activeEntities)
    this.#components = components
    this.#prettyIdMap = prettyIdMap

    this.ctx.logger.info('ECS successfully hydrated with serialized state')
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

    const data: EcsStateEnvelope = {
      metadata,
      state: state as EcsState,
    }

    return JSON.stringify(data)
  }

  isComponent(name: string): name is ComponentName {
    const result = this.#components.has(name as ComponentName)
    this.ctx.logger.debug(`isComponent("${name}"): ${result}`)
    return result
  }

  registerComponent(
    name: ComponentName,
    { serialize }: ComponentRegistrationOptions = { serialize: true },
  ) {
    if (this.#components.has(name)) {
      const err = `Error registering component ${String(name)}: a component by that name is already registered`
      this.ctx.logger.errorAndThrow(err)
    }

    if (!serialize) {
      this.#nonSerializedComponents.add(name)
    }

    this.#components.set(name, new Map())
    this.ctx.logger.info(`Component "${name}" registered`)

    return name
  }

  deregisterComponent(name: ComponentName) {
    if (!this.#components.has(name)) {
      const err = `Error deregistering component ${name}: no component by that name is registered`
      this.ctx.logger.errorAndThrow(err)
    }

    this.#components.delete(name)
    this.ctx.logger.info(`Component "${name}" deregistered`)
  }

  createEntity(metaId?: string, noun?: string) {
    if (metaId && this.#prettyIdMap.has(metaId)) {
      const err = `Cannot register new entity with pretty ID ${metaId}; entity ${this.#prettyIdMap.get(metaId)} is already assigned that ID`
      this.ctx.logger.errorAndThrow(err)
    }
    const id = this.#nextEntityId++

    this.#activeEntities.add(id)
    this.ctx.logger.debug(`Entity ${id} added to active set`)

    const metaIdToSet = metaId || `entity_${id}`

    this.setComponentOnEntity(id, SYSTEM_SCHEMA_COMPONENTS.tags, {
      list: Array.from({ length: 0 }) as Array<string>,
    })
    this.setComponentOnEntity(id, SYSTEM_SCHEMA_COMPONENTS.meta, {
      name: `Entity_${id}`,
      id: metaIdToSet,
      created: Date.now(),
    })
    this.#prettyIdMap.set(metaIdToSet, id)

    if (noun) {
      this.setComponentOnEntity(id, SYSTEM_SCHEMA_COMPONENTS.noun, { noun })
      this.ctx.logger.debug(`Set noun ${noun} on entity ${id}`)
    }

    const componentRevisionsMap = this.#entityRevisions.getOrInsert(id, new Map())

    for (const component in this.#components.keys()) {
      componentRevisionsMap.set(component as ComponentName, this.#revision)
    }

    this.ctx.logger.info(`Entity ${id} created (metaId: "${metaIdToSet}")`)

    return id
  }

  registerSystem(system: System) {
    const { name } = system

    if (this.#systems.has(name)) {
      const err = `Cannot register system: system with name ${name} is already registered`

      this.ctx.logger.errorAndThrow(err)
    }

    this.#systems.set(name, system)
    this.ctx.logger.info(`System ${name} has been registered`)
  }

  deregisterSystem(systemName: string) {
    if (!this.#systems.has(systemName)) {
      const err = `Cannot deregister system: system with name ${systemName} is not registered`

      this.ctx.logger.errorAndThrow(err)
    }

    this.#systems.delete(systemName)
    this.ctx.logger.info(`System ${systemName} has been deregistered`)
  }

  // destructive; overwrites existing component data, if any
  setComponentOnEntity(
    entity: Entity,
    name: ComponentName,
    data: ActiveComponentSchema[ComponentName],
  ) {
    this.#assertEntityExists(entity, 'set component on')

    const systemComponents: readonly string[] = Object.values(SYSTEM_SCHEMA_COMPONENTS)
    if (systemComponents.includes(name)) {
      this.ctx.logger.warn(
        `Setting component ${name} on entity ${entity}; component is a system component, and modifying its data may result in unexpected behavior.`,
      )
    }

    const store = this.#components.get(name)

    if (!store) {
      const err = `Can't set component on entity ${entity}; unknown component type: ${name}`
      this.ctx.logger.errorAndThrow(err)
    }

    store.set(entity, structuredClone(data))
    this.ctx.logger.debug(`Set component "${name}" data on entity ${entity}`)
    this.ctx.logger.silly`Set component "${name}" data on entity ${entity}: ${data}`

    this.#incrementRevision(entity, name)
  }

  // merge component data with new data
  updateComponentData<Component extends ComponentName>(
    entity: Entity,
    name: Component,
    data: Partial<ActiveComponentSchema[Component]>,
  ) {
    const systemComponents: readonly string[] = Object.values(SYSTEM_SCHEMA_COMPONENTS)
    if (systemComponents.includes(name)) {
      this.ctx.logger.warn(
        `Updating data for component ${name} for entity ${entity}: component is a system component, and modifying its data may result in unexpected behavior.`,
      )
    }

    this.#assertEntityExists(entity, 'update component data on')

    const store = this.#components.get(name)

    if (!store) {
      const err = `Can't update component data for entity ${entity}; Unknown component type: ${name}`
      this.ctx.logger.errorAndThrow(err)
    }

    const existingComponentData = store.get(entity)

    if (!existingComponentData) {
      const err = `Can't update component data for entity ${entity}; entity does not have component ${name}`
      this.ctx.logger.errorAndThrow(err)
    }

    this.ctx.logger.debug(`Merging component "${name}" data on entity ${entity}`)
    this.ctx.logger.silly`Merging component "${name}" data on entity ${entity}: ${data}`

    store.set(entity, {
      ...existingComponentData,
      ...data,
    })

    this.#incrementRevision(entity, name)
  }

  removeComponentFromEntity<Component extends ComponentName>(
    entity: Entity,
    componentType: Component,
  ) {
    const systemComponents: readonly string[] = Object.values(SYSTEM_SCHEMA_COMPONENTS)
    if (systemComponents.includes(componentType)) {
      this.ctx.logger.warn(
        `Removing component ${componentType} from entity ${entity}: component is a system component, and modifying its data may result in unexpected behavior.`,
      )
    }

    this.#assertEntityExists(entity, 'remove component from')

    const store = this.#components.get(componentType)

    if (!store) {
      const err = `Can't remove component from entity ${entity}; unknown component type: ${componentType}`
      this.ctx.logger.errorAndThrow(err)
    }

    store.delete(entity)
    this.#entityRevisions.delete(entity)
    this.#incrementRevision()
    this.ctx.logger.debug(`Removed component "${componentType}" from entity ${entity}`)

  }

  getAllEntityComponentData(entity: Entity): Partial<{
    [Component in ComponentName]: ActiveComponentSchema[Component]
  }> {
    this.#assertEntityExists(entity, 'get component data for')

    const data: Partial<ActiveComponentSchema> = {}

    const components = this.getComponentsOnEntity(entity)

    const setComponent = <C extends ComponentName>(
      component: C,
      value: ActiveComponentSchema[C] | undefined,
    ) => {
      data[component] = value
    }

    components.forEach((component) => {
      setComponent(component, this.getEntityComponentData(entity, component))
    })

    return data
  }

  getEntityComponentData<Component extends MandatoryComponent>(
    entity: Entity,
    name: Component,
  ): ActiveComponentSchema[Component]
  getEntityComponentData<Component extends ComponentName>(
    entity: Entity,
    name: Component,
  ): ActiveComponentSchema[Component] | undefined
  getEntityComponentData<Component extends ComponentName>(
    entity: Entity,
    name: ComponentName,
  ): ActiveComponentSchema[Component] | undefined {
    this.#assertEntityExists(entity, 'get component data for')

    const store = this.#components.get(name)
    const componentData = store?.get(entity)

    if (!store || !componentData) {
      const err = `Can't get component data for entity ${entity}; entity does not have component ${name}`
      this.ctx.logger.errorAndThrow(err)
    }

    this.ctx.logger.debug(`Retrieved component "${name}" data for entity ${entity}`)
    this.ctx.logger.silly`Retrieved component "${name}" data for entity ${entity}: ${componentData}`

    return structuredClone(componentData as ActiveComponentSchema[Component])
  }

  entityHasComponent(entity: Entity, componentType: ComponentName): boolean {
    this.#assertEntityExists(entity, 'check for component presence on')

    const component = this.#components.get(componentType)

    if (!component) {
      const err = `Can't check for component presence on entity ${entity}; component ${componentType} does not exist`
      this.ctx.logger.errorAndThrow(err)
    }
    const result = component.has(entity)
    this.ctx.logger.debug(`entityHasComponent(${entity}, "${componentType}"): ${result}`)
    return result
  }

  getComponentsOnEntity(entity: Entity): Set<ComponentName> {
    this.#assertEntityExists(entity, 'get components on')

    const components = Array.from(this.#components).flatMap(([componentName]) =>
      this.entityHasComponent(entity, componentName) ? [componentName] : [],
    )
    this.ctx.logger.debug(`Components on entity ${entity}: [${components.join(', ')}]`)
    return new Set(components)
  }

  getEntitiesByComponents(...componentTypes: ComponentName[]): Set<Entity> {
    if (componentTypes.length === 0) return new Set()

    this.ctx.logger.debug(`Querying entities by components: [${componentTypes.join(', ')}]`)

    if (!componentTypes.every((type) => this.isComponent(type))) {
      const missingTypes = componentTypes.filter((type) => !this.isComponent(type))
      const err = `Cannot get entities by component: given components ${missingTypes.join(', ')} do not exist`
      this.ctx.logger.errorAndThrow(err)
    }

    const sortedTypes = componentTypes.toSorted((a, b) => {
      return (this.#components.get(a)?.size ?? 0) - (this.#components.get(b)?.size ?? 0)
    })

    const [smallestType, ...rest] = sortedTypes

    if (!smallestType) {
      const err = 'Failed to sort component types'
      this.ctx.logger.errorAndThrow(err)
    }
    const smallestStore = this.#components.get(smallestType)

    if (!smallestStore || smallestStore.size === 0) return new Set()

    this.ctx.logger.debug(
      `Using "${smallestType}" as smallest store (size: ${smallestStore.size}) for intersection`,
    )

    const result: Entity[] = []

    for (const entity of smallestStore.keys()) {
      const hasAll = rest.every((type) => this.entityHasComponent(entity, type))
      if (hasAll) result.push(entity)
    }

    this.ctx.logger.debug(`Query result: [${result.join(', ')}] (${result.length} entities)`)

    return new Set(result)
  }

  destroyEntity(entity: Entity) {
    this.#assertEntityExists(entity, 'destroy')

    const prettyId = this.getEntityComponentData(entity, SYSTEM_SCHEMA_COMPONENTS.meta)?.id

    if (!prettyId) {
      const err = `Critical error: Attempting to destroy entity ${entity}, but it has no pretty ID. All entities must have the Meta component and a pretty ID.`
      this.ctx.logger.errorAndThrow(err)
    }

    this.ctx.logger.debug(`Destroying entity ${entity}; clearing all component data`)

    for (const store of this.#components.values()) {
      store.delete(entity)
    }

    this.#activeEntities.delete(entity)
    this.#prettyIdMap.delete(prettyId)
    this.ctx.logger.info(`Entity ${entity} destroyed`)
  }

  getEntityByPrettyId(id: string) {
    const entity = this.#prettyIdMap.get(id)
    this.ctx.logger.debug(`getEntityByPrettyId("${id}"): ${entity ?? 'not found'}`)
    return entity
  }

  entityExists(id: number) {
    const result = this.#activeEntities.has(id)
    this.ctx.logger.debug(`entityExists(${id}): ${result}`)

    return result
  }

  getActiveEntities() {
    this.ctx.logger.silly`Active entities: ${this.#activeEntities}`

    return structuredClone(this.#activeEntities)
  }

  getEntityComponentRevision(entity: Entity, component: ComponentName): Revision {
    this.#assertEntityExists(entity, 'get component revision')

    if (!this.entityHasComponent(entity, component)) {
      this.ctx.logger.errorAndThrow(`Attempted to get revision version for entity ${entity} -> component ${component}, but entity does not have component`)
    }

    const componentRevisionsMap = this.#entityRevisions.get(entity)

    if (!componentRevisionsMap) {
      this.ctx.logger.errorAndThrow(`Attempted to get revision version for entity ${entity} -> component ${component}, but entity does not exist in the revisions map. This is likely an internal engine bug.`)
    }

    const revision = componentRevisionsMap.get(component)

    if (typeof revision === 'undefined') {
      this.ctx.logger.errorAndThrow(`Attempted to get revision version for entity ${entity} -> component ${component}, but component does not exist in the entity's entry in the revisions map. This is likely an internal engine bug.`)
    }

    return revision
  }

  getDirtyEntitiesByComponentRevision(component: ComponentName, lastRevision: Revision) {
    const dirty = new Set<Entity>()

    for (const [entity, componentRevisions] of this.#entityRevisions.entries()) {
      const componentRevision = componentRevisions.get(component)

      if (typeof componentRevision !== 'undefined' && componentRevision > lastRevision) {
        dirty.add(entity)
      }
    }

    return dirty
  }
}
