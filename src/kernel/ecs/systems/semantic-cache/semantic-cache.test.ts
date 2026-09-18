import { describe, expect, mock, test } from 'bun:test'

import EventBus from '@/helpers/event-bus/event-bus'
import { DefaultLogger } from '@/helpers/logger/logger'
import ECS from '@/kernel/ecs/ecs'
import type { EngineComponentSchema } from '@/kernel/ecs/ecs.types'
import { ENGINE_COMPONENT_SCHEMA_COMPONENTS } from '@/kernel/ecs/ecs.types'
import { SemanticCacheSystem } from '@/kernel/ecs/systems/semantic-cache/semantic-cache.system'

interface TestSchema extends EngineComponentSchema {
  position: { x: number; y: number }
  name: { value: string }
}

describe('SemanticCacheSystem', () => {
  function setup() {
    const logger = new DefaultLogger({ info: false, debug: false, error: false, warn: false })
    const eventBus = new EventBus<TestSchema>()
    const ecs = new ECS<TestSchema>(eventBus, logger)
    ecs.registerComponent('name')
    ecs.registerComponent('position')

    const vectorize = mock((_: string) => [1, 2, 3])

    const system = new SemanticCacheSystem<TestSchema>({
      ecs,
      eventBus,
      vectorize,
      logger,
    })

    return { logger, eventBus, ecs, vectorize, system }
  }

  test('name is SemanticCache', () => {
    const { system } = setup()
    expect(system.name).toBe('SemanticCache')
  })

  test('onInit registers the semantic cache component', async () => {
    const { ecs, system } = setup()

    await system.onInit()

    expect(ecs.isComponent(ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)).toBe(true)
  })

  test('onRun requires initialization', async () => {
    const { system } = setup()
    expect(system.onRun()).rejects.toThrow(
      'Cannot run SemanticCache system; system not initialized',
    )
  })

  test('onRun processes dirty semantic caches', async () => {
    const { ecs, system } = setup()
    await system.onInit()

    const entity = ecs.createEntity()
    system.registerResolver('name', (data) => `Name is ${data.value}`)

    // Modifying the component triggers #handleComponentModified which adds dirty cache
    ecs.setComponentOnEntity(entity, 'name', { value: 'Run Test' })

    await system.onRun()

    const cacheData = ecs.getEntityComponentData(
      entity,
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )
    expect(cacheData.dirty).toBe(false)
    expect(cacheData.fullDescriptor).toContain('Name is Run Test')
  })

  test('onDispose removes listeners and deregisters cache component', async () => {
    const { ecs, system } = setup()
    await system.onInit()

    expect(ecs.isComponent(ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)).toBe(true)

    await system.onDispose()

    expect(ecs.isComponent(ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)).toBe(false)
  })

  test('registerResolver and deregisterResolver work as expected', async () => {
    const { system, ecs } = setup()
    await system.onInit()

    system.registerResolver('name', (data) => `Name is ${data.value}`)

    const entity = ecs.createEntity()
    ecs.setComponentOnEntity(entity, 'name', { value: 'To deregister' })

    // #handleComponentModified automatically set it to dirty. Let's make it not dirty
    ecs.updateComponentData(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
      dirty: false,
    })

    system.deregisterResolver('name')

    const cacheData = ecs.getEntityComponentData(
      entity,
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )
    expect(cacheData.dirty).toBe(true)
  })

  test('deregisterResolver gracefully handles unregistered resolvers', () => {
    const { system } = setup()
    // Should not throw
    expect(() => {
      system.deregisterResolver('name')
    }).not.toThrow()
  })

  test('component modification triggers cache invalidation', async () => {
    const { ecs, system } = setup()
    system.registerResolver('name', (data) => `Name is ${data.value}`)
    await system.onInit()

    const entity = ecs.createEntity()

    ecs.setComponentOnEntity(entity, 'name', { value: 'New Name' })

    expect(ecs.entityHasComponent(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)).toBe(
      true,
    )
    const cacheData = ecs.getEntityComponentData(
      entity,
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )
    expect(cacheData.dirty).toBe(true)

    // Mark it not dirty to check if update makes it dirty again
    ecs.updateComponentData(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
      dirty: false,
    })

    ecs.updateComponentData(entity, 'name', { value: 'Another Name' })
    const cacheData2 = ecs.getEntityComponentData(
      entity,
      ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache,
    )
    expect(cacheData2.dirty).toBe(true)
  })

  test('entities with cache component but no matching resolvers will have cache component removed', async () => {
    const { ecs, system } = setup()
    await system.onInit()

    const entity = ecs.createEntity()
    ecs.setComponentOnEntity(entity, 'name', { value: 'Missing Resolver' })

    // Explicitly add the semantic cache component, pretending we want to build it
    ecs.setComponentOnEntity(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
      dirty: true,
      fullDescriptor: '',
      chunks: [],
      fullVector: [],
    })

    await system.onRun()

    expect(ecs.entityHasComponent(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache)).toBe(
      false,
    )
  })

  test('buildCache throws error if entity does not exist', async () => {
    const { ecs, system } = setup()
    await system.onInit()

    const entity = ecs.createEntity()
    ecs.setComponentOnEntity(entity, ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache, {
      dirty: true,
      fullDescriptor: '',
      chunks: [],
      fullVector: [],
    })

    ecs.destroyEntity(entity)

    // Hack getEntitiesByComponents to return the destroyed entity
    const activeEntitiesSpy = mock(() => new Set([entity]))
    ecs.getEntitiesByComponents = activeEntitiesSpy as any

    // Mock getEntityComponentData to return dirty: true so it proceeds to #buildCacheForEntity
    const originalGetEntityComponentData = ecs.getEntityComponentData.bind(ecs)
    ecs.getEntityComponentData = mock((e: any, c: any) => {
      if (e === entity && c === ENGINE_COMPONENT_SCHEMA_COMPONENTS.semanticCache) {
        return { dirty: true }
      }
      return originalGetEntityComponentData(e, c)
    }) as any

    expect(system.onRun()).rejects.toThrow(
      `Attempted to build semantic cache for entity ${entity}, but no such entity exists`,
    )
  })
})
