import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import {
  SYSTEM_SCHEMA_COMPONENTS,
  type Entity,
  InitializableSystem,
  type ComponentName,
  type ActiveComponentSchema,
  type Revision,
} from '@/kernel/ecs/ecs.types'
import type {
  ComponentResolverMap,
  DescriptorCacheEntry,
  SemanticCacheConfig,
  SemanticCacheData,
} from '@/kernel/ecs/systems/semantic-cache/semantic-cache.types'

const DESCRIPTOR_DELIMITER = ';;'

function aggregateDescriptors(descriptors: Map<ComponentName, string>): DescriptorCacheEntry {
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
export class SemanticCacheSystem extends InitializableSystem {
  #ecs: ECS
  #lastSeenRevision: Revision
  #resolvers: ComponentResolverMap
  #staleResolvers: Set<ComponentName>
  #vectorize: (text: string) => number[]
  #descriptorAggregator: (descriptors: Map<ComponentName, string>) => DescriptorCacheEntry
  logger: Logger

  constructor({ ecs, vectorize, logger, customDescriptorAggregator }: SemanticCacheConfig) {
    super()
    this.#ecs = ecs
    this.#vectorize = vectorize

    this.logger = logger ?? new DefaultLogger()
    this.#resolvers = new Map() as ComponentResolverMap
    this.#descriptorAggregator = customDescriptorAggregator ?? aggregateDescriptors

    this.#lastSeenRevision = this.#ecs.currentRevision
    this.#staleResolvers = new Set(this.#resolvers.keys())
  }

  get name() {
    return 'SemanticCache'
  }

  async onRun(): Promise<void> {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot run ${this.name} system; system not initialized`)
    }

    const dirtyEntities = new Set<Entity>()

    for (const entity of this.#ecs.getDirtyEntitiesByComponentRevision(
      SYSTEM_SCHEMA_COMPONENTS.semanticCache,
      this.#lastSeenRevision,
    )) {
      dirtyEntities.add(entity)
    }

    for (const entity of this.#ecs.getDirtyEntitiesByComponentRevision(
      SYSTEM_SCHEMA_COMPONENTS.noun,
      this.#lastSeenRevision,
    )) {
      dirtyEntities.add(entity)
    }

    for (const component of this.#resolvers.keys()) {
      for (const entity of this.#ecs.getDirtyEntitiesByComponentRevision(
        component,
        this.#lastSeenRevision,
      )) {
        dirtyEntities.add(entity)
      }
    }

    for (const component of this.#staleResolvers) {
      if (this.#ecs.isComponent(component)) {
        for (const entity of this.#ecs.getEntitiesByComponents(component)) {
          dirtyEntities.add(entity)
        }
      }
    }

    for (const entity of dirtyEntities) {
      this.#buildCacheForEntity(entity)
    }

    this.#lastSeenRevision = this.#ecs.currentRevision
    this.#staleResolvers.clear()
  }

  async onInit() {
    if (this.initialized) {
      this.logger.errorAndThrow(`Cannot initialize ${this.name} system; system already initialized`)
    }

    this.#lastSeenRevision = this.#ecs.currentRevision

    for (const componentWithResolver of this.#resolvers.keys()) {
      this.#staleResolvers.add(componentWithResolver)
    }

    this.#ecs.registerComponent(SYSTEM_SCHEMA_COMPONENTS.semanticCache)
    this.initialized = true
    await this.onRun()
    this.logger.info('Semantic Cache System initialized')
  }

  async onDispose() {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot dispose of ${this.name} system; system not initialized`)
    }

    this.#ecs.deregisterComponent(SYSTEM_SCHEMA_COMPONENTS.semanticCache)
    this.initialized = false

    this.logger.info('Semantic Cache System disposed; cache component removed from all entities')
  }

  registerResolver<Component extends ComponentName>(
    componentName: Component,
    resolver: (componentData: ActiveComponentSchema[Component]) => string,
  ) {
    if (this.#resolvers.has(componentName)) {
      this.logger.info(`Replacing existing resolver for component ${componentName}`)
    } else {
      this.logger.info(`Registering new resolver for component ${componentName}`)
    }

    this.#resolvers.set(componentName, resolver)
    this.#staleResolvers.add(componentName)
  }

  deregisterResolver<Component extends ComponentName>(componentName: Component) {
    if (!this.#resolvers.has(componentName)) {
      this.logger.warn(
        `Cannot deregister resolver for component ${componentName}; resolver not registered`,
      )
      return
    }

    this.#resolvers.delete(componentName)
    this.#staleResolvers.add(componentName)

    this.logger.info(
      `Removed resolver for component ${componentName}; all entities marked as requiring cache rebuild on next tick`,
    )
  }

  #buildCacheForEntity(entity: Entity) {
    if (!this.#ecs.entityExists(entity)) {
      const err = `Attempted to build semantic cache for entity ${entity}, but no such entity exists`
      this.logger.errorAndThrow(err)
    }

    const entityHasNoun =
      this.#ecs.entityHasComponent(entity, SYSTEM_SCHEMA_COMPONENTS.noun) &&
      !!this.#ecs.getEntityComponentData(entity, SYSTEM_SCHEMA_COMPONENTS.noun)?.noun

    if (!entityHasNoun) {
      this.logger.info(
        `
        Semantic Cache build triggered in Semantic Cache system for entity ${entity}, but entity does not have the Noun component.
        Skipping semantic cache generation and removing cache component. Player will not be able to directly interact with this entity.
      `.trim(),
      )

      if (this.#ecs.entityHasComponent(entity, SYSTEM_SCHEMA_COMPONENTS.semanticCache)) {
        this.#ecs.removeComponentFromEntity(entity, SYSTEM_SCHEMA_COMPONENTS.semanticCache)
      }
      return
    }

    const componentDescriptors: Map<ComponentName, string> = new Map()

    const componentData = this.#ecs.getAllEntityComponentData(entity)

    for (const [componentName, data] of Object.entries(componentData)) {
      const resolver = this.#resolvers.get(componentName as ComponentName)

      if (resolver) {
        componentDescriptors.set(componentName as ComponentName, resolver(data))
      }
    }

    if (componentDescriptors.size === 0) {
      this.logger.info(
        `
        Attempted to build cache for entity ${entity}, but entity has no components which have corresponding resolvers.
        Removing Semantic Cache component from entity, as the resulting descriptor cache would be empty
      `.trim(),
      )

      if (this.#ecs.entityHasComponent(entity, SYSTEM_SCHEMA_COMPONENTS.semanticCache)) {
        this.#ecs.removeComponentFromEntity(entity, SYSTEM_SCHEMA_COMPONENTS.semanticCache)
      }

      return
    }

    const aggregated = this.#descriptorAggregator(componentDescriptors)
    const chunks = aggregated.chunked.map(
      (descriptor) => [descriptor, this.#vectorize(descriptor)] as [string, number[]],
    )

    const cacheEntry: SemanticCacheData = {
      fullDescriptor: aggregated.combined,
      fullVector: this.#vectorize(aggregated.combined),
      chunks,
    }

    this.#ecs.setComponentOnEntity(entity, SYSTEM_SCHEMA_COMPONENTS.semanticCache, cacheEntry)

    this.logger.debug(`Built semantic cache for entity ${entity}`)
    this.logger.silly`Semantic cache for entity ${entity}: ${cacheEntry}`
  }
}
