import { defaultEmitStreams } from '@/helpers/event-bus/event-bus'
import type EventBus from '@/helpers/event-bus/event-bus'
import type {
  DefaultEventMap,
  EcsComponentModifiedEventPayload,
  EngineEvent,
} from '@/helpers/event-bus/event-bus.types'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import {
  ENGINE_COMPONENT_SCHEMA_COMPONENTS,
  type EngineComponentSchema,
  type Entity,
  InitializableSystem,
} from '@/kernel/ecs/ecs.types'
import type {
  DescriptorCacheEntry,
  SemanticCacheConfig,
} from '@/kernel/ecs/systems/semantic-cache/semantic-cache.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

const DESCRIPTOR_DELIMITER = ';;'

function aggregateDescriptors<ComponentSchema extends EngineComponentSchema & Record<string, POJO>>(
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

/**
 * The semantic resolution system connects entities in the ECS to the NLP pipeline.
 *
 * In order for the NLP pipeline to have a way of "understanding" the dynamic state of the game
 * without re-training the models, this system generates `descriptors`, which are programmatically
 * constructed from game state. A `resolver` must be provided for any components which the game
 * engine needs to be able to associate with an entity at runtime as a result of player input.
 * Descriptors should only include information that the player should know about;
 * e.g., if an item is secretly cursed, the user should likely not be able to pick it up with
 * "pick up the cursed amulet" until they have identified that it is cursed.
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
 * Note that the Noun component is crucial for the entity association step. Descriptors are chunked by component
 * to avoid embedding dilution, and to ensure that descriptors from the Semantic Cache are associated with the
 * correct entity, the Noun.noun value will be prefixed on the descriptors from this cache.
 * e.g. looking at the above example of DamageComponent, if it is attached to an entity representing a goblin,
 * you might attach a Noun to the goblin, "goblin"; the vectors cached by this system will include it like
 * "goblin: health level: 33, status effects: poisoned, blessed" per chunk.
 */
export class SemanticCacheSystem<
  ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
  EventMapType extends DefaultEventMap<ComponentSchema> = DefaultEventMap<ComponentSchema>,
> extends InitializableSystem<ComponentSchema> {
  #initialized = false
  #ecs: ECS<ComponentSchema>
  #eventBus: EventBus<ComponentSchema, EventMapType>
  #resolvers: Map<keyof ComponentSchema & string, (componentData: any) => string>
  #vectorize: (text: string) => number[]
  #descriptorAggregator: (
    descriptors: Map<keyof ComponentSchema & string, string>,
  ) => DescriptorCacheEntry
  logger: Logger

  constructor({
    ecs,
    eventBus,
    vectorize,
    logger,
    customDescriptorAggregator,
  }: SemanticCacheConfig<ComponentSchema, EventMapType>) {
    super()
    this.#ecs = ecs
    this.#eventBus = eventBus
    this.#vectorize = vectorize

    this.logger = logger ?? new DefaultLogger()
    this.#resolvers = new Map<keyof ComponentSchema & string, (componentData: any) => string>()
    this.#descriptorAggregator = customDescriptorAggregator ?? aggregateDescriptors<ComponentSchema>
  }

  get name() {
    return 'SemanticCache'
  }

  async onRun(): Promise<void> {
    if (!this.#initialized) {
      this.logger.errorAndThrow(`Cannot run ${this.name} system; system not initialized`)
    }

    const entitiesWithCache = this.#ecs.getEntitiesByComponents(
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )

    entitiesWithCache.forEach((entity) => {
      const { dirty } = this.#ecs.getEntityComponentData(
        entity,
        ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
      ) ?? {}

      if (dirty) {
        this.#buildCacheForEntity(entity)
      }
    })
  }

  async onInit() {
    this.#eventBus.subscribe(defaultEmitStreams.ecsComponentModified, this.#handleComponentModified)
    this.#ecs.registerComponent(ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)
    this.#buildCache()
    this.#initialized = true
    this.logger.info('Semantic Cache System initialized; all listeners added')
  }

  async onDispose() {
    this.#eventBus.unsubscribe(
      defaultEmitStreams.ecsComponentModified,
      this.#handleComponentModified,
    )

    this.#ecs.deregisterComponent(ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)

    this.logger.info(
      'Semantic Cache System disposed; all listeners unbound and cache component removed from all entities',
    )
  }

  registerResolver<K extends keyof ComponentSchema & string>(
    componentName: K,
    resolver: (componentData: Readonly<ComponentSchema[K]>) => string,
  ) {
    if (this.#resolvers.has(componentName)) {
      this.logger.info(`Replacing existing resolver for component ${componentName}`)
    } else {
      this.logger.info(`Registering new resolver for component ${componentName}`)
    }

    this.#resolvers.set(componentName, resolver as (componentData: any) => string)

    const entitiesWithComponent = this.#ecs.getEntitiesByComponents(componentName)

    for (const entity of entitiesWithComponent) {
      this.#ecs.updateComponentData(
        entity,
        ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
        { dirty: true },
      )
    }
  }

  deregisterResolver<K extends keyof ComponentSchema & string>(componentName: K) {
    if (!this.#resolvers.has(componentName)) {
      this.logger.warn(
        `Cannot deregister resolver for component ${componentName}; resolver not registered`,
      )
      return
    }

    this.#resolvers.delete(componentName)

    const entitiesWithCache = this.#ecs.getEntitiesByComponents(
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )

    for (const entity of entitiesWithCache) {
      this.#ecs.updateComponentData(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
        dirty: true,
      })
    }

    this.logger.info(
      `Removed resolver for component ${componentName}; all entities marked as requiring cache rebuild on next tick`,
    )
  }

  #buildCacheForEntity(entity: Entity) {
    if (!this.#ecs.entityExists(entity)) {
      const err = `Attempted to build semantic cache for entity ${entity}, but no such entity exists`
      this.logger.errorAndThrow(err)
    }

    const componentDescriptors: Map<keyof ComponentSchema & string, string> = new Map()

    const componentData = this.#ecs.getAllEntityComponentData(entity)

    for (const [componentName, data] of Object.entries(componentData)) {
      const resolver = this.#resolvers.get(componentName)
      if (resolver) {
        componentDescriptors.set(componentName, resolver(data))
      }
    }

    if (componentDescriptors.size === 0) {
      this.logger.info(`
        Attempted to build cache for entity ${entity}, but entity has no components which have corresponding resolvers.
        Removing Semantic Cache component from entity, as the resulting descriptor cache would be empty
      `.trim())

      this.#ecs.removeComponentFromEntity(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)

      return
    }

    const aggregated = this.#descriptorAggregator(componentDescriptors)
    const chunks = aggregated.chunked.map(
      (descriptor) => [descriptor, this.#vectorize(descriptor)] as [string, number[]],
    )

    this.#ecs.setComponentOnEntity(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
      dirty: false,
      fullDescriptor: aggregated.combined,
      fullVector: this.#vectorize(aggregated.combined),
      chunks,
    })
  }

  #buildCache() {
    this.logger.debug('Building semantic caches for all entities')

    const activeEntitiesWithCache = this.#ecs.getEntitiesByComponents(
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )

    for (const entity of activeEntitiesWithCache) {
      this.#buildCacheForEntity(entity)
    }
  }

  #handleComponentModified = ({
    payload: { entity, component },
  }: EngineEvent<EcsComponentModifiedEventPayload<ComponentSchema>>) => {
    if (component === ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache) {
      this.logger.debug(
        `Semantic Cache system detected change in Semantic Cache component data on entity ${entity}; returning`,
      )
      return
    }

    const resolver = this.#resolvers.get(component)

    if (!resolver) {
      this.logger.debug(`
        Component modification handler triggered in Semantic Cache system, but no resolver exists for component ${component}; returning.
      `.trim())

      return
    }

    const entityHasNoun = !!(this.#ecs.getEntityComponentData(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.noun)?.noun)

    if (!entityHasNoun) {
      this.logger.debug(`
        Component modification handler triggered in Semantic Cache system for entity ${entity},
        and there is a resolver registered for component ${component}, but entity does not have the Noun component.
        Skipping semantic cache generation. Player will not be able to directly interact with this entity.
      `.trim())

      return
    }

    const cacheExists = this.#ecs.entityHasComponent(
      entity,
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )

    if (!cacheExists) {
      this.logger.debug(`
        A semantic cache resolver exists for component ${component}, and entity ${entity} has that component,
        but no cache entry exists for the entity. Marking entity for descriptor cache generation.
      `.trim())
      this.#ecs.setComponentOnEntity(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
        dirty: true,
      })
    } else {
      this.logger.debug(`
        A semantic cache resolver exists for component ${component}, entity ${entity} has that component,
        and a cache entry exists for the entity. Marking entity for descriptor cache regeneration.
      `.trim())
      this.#ecs.updateComponentData(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
        dirty: true,
      })
    }
  }
}
