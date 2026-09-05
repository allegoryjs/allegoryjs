import { defaultEmitStreams } from '@/helpers/event-bus/event-bus'
import type EventBus from '@/helpers/event-bus/event-bus'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import type { EngineComponentSchema, Entity, EcsReadonlyFacade } from '@/kernel/ecs/ecs.types'
import type { DescriptorCacheEntry } from '@/kernel/semantic-resolution/semantic-resolution.types'

const DESCRIPTOR_DELIMITER = ';;'

function buildDescriptor<ComponentSchema extends EngineComponentSchema & Record<string, any>>(
  descriptors: Map<keyof ComponentSchema & string, string>,
): DescriptorCacheEntry {
  return {
    combined: Array.from(descriptors).reduce(
      (acc, [_, descriptor]) => `${acc} ${DESCRIPTOR_DELIMITER} ${descriptor}`,
      '',
    ),
    chunked: Array.from(descriptors.values()),
  }
}
class SemanticResolutionSystem<
  ComponentSchema extends EngineComponentSchema & Record<string, any> = EngineComponentSchema,
> {
  #initialized = false
  #ecs: EcsReadonlyFacade<ComponentSchema>
  #eventBus: EventBus
  #logger: Logger
  #descriptorCache: Map<Entity, Map<keyof ComponentSchema & string, string>>
  #resolvers: Map<keyof ComponentSchema & string, (componentData: any) => string>
  #descriptorBuilder: (
    descriptors: Map<keyof ComponentSchema & string, string>,
  ) => DescriptorCacheEntry

  constructor(
    ecs: EcsReadonlyFacade<ComponentSchema>,
    eventBus: EventBus,
    logger?: Logger,
    customDescriptorBuilder?: (
      descriptors: Map<keyof ComponentSchema & string, string>,
    ) => DescriptorCacheEntry,
  ) {
    this.#ecs = ecs
    this.#eventBus = eventBus
    this.#logger = logger ?? new DefaultLogger()
    this.#descriptorCache = new Map()
    this.#resolvers = new Map()
    this.#descriptorBuilder = customDescriptorBuilder ?? buildDescriptor<ComponentSchema>
  }

  init() {
    if (this.#initialized) {
      this.#logger.warn('Cannot initialize Semantic Resolution System: already initialized')
      return
    }

    this.#eventBus.subscribe(defaultEmitStreams.ecsComponentModified, this.#handleComponentModified)

    this.#eventBus.subscribe(defaultEmitStreams.ecsEntityCreated, this.#handleEntityCreated)

    this.#eventBus.subscribe(defaultEmitStreams.ecsEntityDestroyed, this.#handleEntityDestroyed)

    this.rebuildCache()
    this.#initialized = true
    this.#logger.info('Semantic Resolution System initialized; all listeners added')
  }

  dispose() {
    if (!this.#initialized) {
      this.#logger.warn(
        'Disposal of uninitialized Semantic Resolution System triggered; system revoked',
      )
      return
    }

    this.#eventBus.unsubscribe(
      defaultEmitStreams.ecsComponentModified,
      this.#handleComponentModified,
    )

    this.#eventBus.unsubscribe(defaultEmitStreams.ecsEntityCreated, this.#handleEntityCreated)

    this.#eventBus.unsubscribe(defaultEmitStreams.ecsEntityDestroyed, this.#handleEntityDestroyed)

    this.#logger.info('Semantic Resolution System disposed; all listeners unbound')
  }

  [Symbol.dispose]() {
    this.dispose()
  }

  registerResolver<K extends keyof ComponentSchema & string>(
    componentName: K,
    resolver: (componentData: Readonly<ComponentSchema[K]>) => string,
  ) {
    if (this.#resolvers.has(componentName)) {
      this.#logger.info(`Replacing existing resolver for component ${componentName}`)
    } else {
      this.#logger.info(`Registering new resolver for component ${componentName}`)
    }

    this.#resolvers.set(componentName, resolver as (componentData: any) => string)
  }

  deregisterResolver<K extends keyof ComponentSchema & string>(componentName: K) {
    if (!this.#resolvers.has(componentName)) {
      this.#logger.warn(
        `Cannot deregister resolver for component ${componentName}; resolver not registered`,
      )
      return
    }

    this.#resolvers.delete(componentName)
    this.#descriptorCache.forEach((componentMap) => {
      componentMap.delete(componentName)
    })

    this.#logger.info(`Removed resolver for component ${componentName}`)
  }

  getEntityDescriptor(entity: Entity) {
    if (!this.#ecs.entityExists(entity)) {
      const err = `Attempting to get descriptor for entity ${entity}, but no such entity exists`
      this.#logger.errorAndThrow(err)
    }

    const descriptorCache = this.#descriptorCache.get(entity)

    if (!descriptorCache) {
      this.#logger.warn(`
                Attempting to get descriptor, but no descriptor cache exists for entity ${entity}.
                You can call rebuildCache to rectify this, but the cache should be getting built automatically.
                You should verify that the ECS and semantic resolver are communicating properly through the event bus.
                Aborting.
            `)
      return
    }

    return this.#descriptorBuilder(descriptorCache)
  }

  rebuildCache() {
    this.#logger.debug('Rebuilding descriptor cache for all entities')

    this.#descriptorCache = Array.from(this.#ecs.getActiveEntities()).reduce((accOuter, entity) => {
      const cache = Array.from(this.#ecs.getComponentsOnEntity(entity)).reduce(
        (accInner, component) => {
          const resolver = this.#resolvers.get(component)

          if (!resolver) {
            this.#logger.info(
              `While rebuilding the descriptor cache, component ${component} was skipped because it has no resolver`,
            )
          } else {
            const componentData = this.#ecs.getEntityComponentData(entity, component)
            accInner.set(component, resolver(componentData))
          }

          return accInner
        },
        new Map<keyof ComponentSchema & string, string>(),
      )

      accOuter.set(entity, cache)
      return accOuter
    }, new Map<Entity, Map<keyof ComponentSchema & string, string>>())
  }

  #handleComponentModified = (payload: unknown) => {
    const { entity, component } = payload as {
      entity: Entity
      component: keyof ComponentSchema & string
    }
    const componentData = this.#ecs.getEntityComponentData(entity, component)
    const resolver = this.#resolvers.get(component)

    if (!resolver) {
      this.#logger.debug(
        `
                Component modification event received, but no semantic resolver exists for component ${component}.
                The state of this component will not be interpretable by the ML pipeline.
                You should add a resolver using registerResolver if entities should be identifiable using data from this component.
            `.trim(),
      )

      return
    }

    const resolvedDescriptor = resolver(componentData)
    const cacheEntry = this.#descriptorCache.get(entity)

    if (!cacheEntry) {
      this.#logger.warn(
        `
                Attempted to access nonexistent descriptor cache entry for entity ${entity}.
                A new cache entry will be created for entity ${entity} -> component ${component}.
                You should verify that the event bus is being invoked properly when ECS component data is modified.
            `.trim(),
      )
      this.#descriptorCache.set(entity, new Map([[component, resolvedDescriptor]]))
    } else {
      cacheEntry.set(component, resolvedDescriptor)
    }

    this.#logger.debug(
      `Descriptor cache for entity ${entity} -> component ${component} set to "${resolvedDescriptor}"`,
    )
  }

  #handleEntityCreated = (payload: unknown) => {
    const entity = payload as Entity
    if (this.#descriptorCache.get(entity)) {
      this.#logger.warn(
        `Attempted to add entity ${entity} as a new entry in the descriptor cache, but an entry already exists for it. Aborting.`,
      )
      return
    }

    this.#descriptorCache.set(entity, new Map())
  }

  #handleEntityDestroyed = (payload: unknown) => {
    const entity = payload as Entity
    if (!this.#descriptorCache.get(entity)) {
      this.#logger.warn(
        `Attempted to remove entity ${entity} from the descriptor cache, but there is no entry for it. Aborting.`,
      )
      return
    }

    this.#descriptorCache.delete(entity)
  }
}

/**
 * The semantic resolution system connects entities in the ECS to the NLP pipeline.
 * **Must be initialized before use and disposed of after use (with the `using` keyword or the `dispose` method)**.
 *
 * In order for the NLP pipeline to have a way of "understanding" the dynamic state of the game
 * without re-training the models, this system generates `descriptors`, which are programmatically
 * constructed from game state. A `resolver` must be provided for any components which the game
 * engine needs to be able to associate with an entity at runtime. Descriptors should only include
 * information that the player should know about; e.g., if an item is secretly cursed, the user should likely
 * not be able to pick it up with "pick up the cursed amulet" until they have identified that it is cursed.
 *
 * For example, imagine a component called DamageComponent, which has data shaped like `{ health: 80, statusEffects: ['poisoned', 'blessed']}`
 * The resolver for that component might look like:
 * ```
 * (componentState: DamageComponentState) => {
 *   let healthLevel
 *   if (componentState.health < 30) {
 *       healthLevel = 'low health'
 *   } else {
 *       healthLevel = 'healthy'
 *   }
 *
 *   const statusEffectText = componentState.statusEffects.length ? componentState.statusEffects.join(', ') : 'none'
 *
 *   return `Health level: ${health level}, status effects: ${statusEffectText}`
 * }
 *
 * // outputs 'Health level: healthy, status effects: poisoned, blessed'
 * ```
 *
 *
 * @example
 * using semanticResolutionSystem1 = createSemanticResolutionSystem(eventBus)
 * semanticResolutionSystem1.init() // no need to dispose if using the 'using' keyword
 *
 * // or
 *
 * const semanticResolutionSystem2 = createSemanticResolutionSystem(eventBus)
 * semanticResolutionSystem2.init()
 * semanticResolutionSystem2.dispose()
 */
export function createSemanticResolutionSystem<
  ComponentSchema extends EngineComponentSchema & Record<string, any> = EngineComponentSchema,
>(ecs: EcsReadonlyFacade<ComponentSchema>, eventBus: EventBus, logger?: Logger) {
  const system = new SemanticResolutionSystem<ComponentSchema>(ecs, eventBus, logger)

  const { proxy, revoke } = Proxy.revocable(system, {
    get(target, prop, receiver) {
      if (prop === 'dispose') {
        return () => {
          target.dispose()
          revoke()
        }
      }

      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') {
        return value.bind(target)
      }

      return value
    },
  })

  return proxy as SemanticResolutionSystem<ComponentSchema>
}
