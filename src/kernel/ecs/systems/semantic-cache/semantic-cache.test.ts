import { describe, expect, mock, test } from 'bun:test'

import { DefaultLogger } from '@/helpers/logger/logger'
import ECS from '@/kernel/ecs/ecs'
import { type ComponentName, SYSTEM_SCHEMA_COMPONENTS } from '@/kernel/ecs/ecs.types'
import { SemanticCacheSystem } from '@/kernel/ecs/systems/semantic-cache/semantic-cache.system'
import type { DescriptorCacheEntry } from '@/kernel/ecs/systems/semantic-cache/semantic-cache.types'

declare global {
  interface AllegoryCustomComponentSchema {
    damage: {
      health: number
      statusEffects: string[]
    }
    stats: {
      strength: number
      defense: number
    }
    color: {
      name: string
    }
    unrelated: {
      secret: boolean
    }
  }
}

function makeECS() {
  const logger = new DefaultLogger({
    channelOpts: {
      info: false,
      debug: false,
      error: false,
      warn: false,
      silly: false,
    },
  })
  return new ECS(logger)
}

function makeSystem(
  ecs: ECS,
  options?: {
    vectorize?: (text: string) => number[]
    customDescriptorAggregator?: (descriptors: Map<ComponentName, string>) => DescriptorCacheEntry
  },
) {
  const logger = new DefaultLogger({
    channelOpts: {
      info: false,
      debug: false,
      error: false,
      warn: false,
      silly: false,
    },
  })
  const vectorize = options?.vectorize ?? ((text: string) => [text.length])
  return new SemanticCacheSystem({
    ecs,
    vectorize,
    logger,
    customDescriptorAggregator: options?.customDescriptorAggregator,
  })
}

// ─── System Name & Constructor ──────────────────────────────────────

describe('SemanticCacheSystem - constructor and name', () => {
  test('returns "SemanticCache" as system name', () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    expect(system.name).toBe('SemanticCache')
  })

  test('defaults to DefaultLogger if no logger is provided', () => {
    const ecs = makeECS()
    const system = new SemanticCacheSystem({
      ecs,
      vectorize: (text: string) => [text.length],
    })
    expect(system.logger).toBeInstanceOf(DefaultLogger)
  })

  test('uses custom logger when provided', () => {
    const ecs = makeECS()
    const customLogger = new DefaultLogger({
      channelOpts: {
        info: false,
        debug: false,
        error: false,
        warn: false,
        silly: false,
      },
    })
    const system = new SemanticCacheSystem({
      ecs,
      vectorize: (text: string) => [text.length],
      logger: customLogger,
    })
    expect(system.logger).toBe(customLogger)
  })
})

// ─── Lifecycle: onInit, onDispose, onRun ────────────────────────────

describe('SemanticCacheSystem - lifecycle', () => {
  test('registers SemanticCache component in ECS on init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    expect(ecs.isComponent('SemanticCache')).toBe(false)

    await system.onInit()
    expect(ecs.isComponent('SemanticCache')).toBe(true)
  })

  test('throws if onInit is called when already initialized', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.onInit()

    expect(system.onInit()).rejects.toThrow('system already initialized')
  })

  test('throws if init(ecs) is called when already initialized', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.init(ecs)

    expect(system.init(ecs)).rejects.toThrow('system already initialized')
  })

  test('throws if onRun is called before onInit', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    expect(system.onRun()).rejects.toThrow('system not initialized')
  })

  test('throws if run(ecs) is called before init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    expect(system.run(ecs)).rejects.toThrow('system not initialized')
  })

  test('throws if onDispose is called before onInit', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    expect(system.onDispose()).rejects.toThrow('system not initialized')
  })

  test('throws if dispose(ecs) is called before init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    expect(system.dispose(ecs)).rejects.toThrow('system not initialized')
  })

  test('deregisters SemanticCache component on dispose', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.onInit()
    expect(ecs.isComponent('SemanticCache')).toBe(true)

    await system.onDispose()
    expect(ecs.isComponent('SemanticCache')).toBe(false)
  })

  test('throws if onRun is called after disposal', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.onInit()
    await system.onDispose()

    expect(system.onRun()).rejects.toThrow('system not initialized')
  })

  test('can be re-initialized after disposal', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.onInit()
    await system.onDispose()
    expect(ecs.isComponent('SemanticCache')).toBe(false)

    await system.onInit()
    expect(ecs.isComponent('SemanticCache')).toBe(true)
  })

  test('works with System interface methods init, run, dispose', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    await system.init(ecs)
    expect(ecs.isComponent('SemanticCache')).toBe(true)

    await system.run(ecs)

    await system.dispose(ecs)
    expect(ecs.isComponent('SemanticCache')).toBe(false)
  })
})

// ─── Resolvers: registerResolver & deregisterResolver ───────────────

describe('SemanticCacheSystem - resolver registration', () => {
  test('registerResolver adds a resolver and marks component stale', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: ['poisoned'],
    })

    system.registerResolver(
      'damage',
      (d) => `health: ${d.health}, effects: ${d.statusEffects.join(', ')}`,
    )

    await system.onInit()

    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(true)
    const cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain('health: 100, effects: poisoned')
  })

  test('replacing an existing resolver updates output on next run', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `v1: ${d.health}`)
    await system.onInit()

    let cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain('v1: 100')

    system.registerResolver('damage', (d) => `v2: ${d.health}`)
    await system.onRun()

    cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain('v2: 100')
  })

  test('deregisterResolver removes resolver and updates cache on next run', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    ecs.registerComponent('stats')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })
    ecs.setComponentOnEntity(entity, 'stats', {
      strength: 15,
      defense: 10,
    })

    system.registerResolver('damage', (d) => `hp: ${d.health}`)
    system.registerResolver('stats', (s) => `str: ${s.strength}`)
    await system.onInit()

    let cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain('hp: 100')
    expect(cache?.fullDescriptor).toContain('str: 15')

    system.deregisterResolver('damage')
    await system.onRun()

    cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).not.toContain('hp: 100')
    expect(cache?.fullDescriptor).toContain('str: 15')
  })

  test('deregisterResolver does not throw if resolver is not registered', () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    expect(() => system.deregisterResolver('damage')).not.toThrow()
  })

  test('deregistering the only resolver on an entity removes SemanticCache component', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `hp: ${d.health}`)
    await system.onInit()
    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(true)

    system.deregisterResolver('damage')
    await system.onRun()

    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(false)
  })
})

// ─── Cache Building & Aggregation ───────────────────────────────────

function customAggregator(descriptors: Map<ComponentName, string>): DescriptorCacheEntry {
  return {
    combined: Array.from(descriptors.values()).join(' --- '),
    chunked: Array.from(descriptors.values()).map((d) => `CHUNK: ${d}`),
  }
}

describe('SemanticCacheSystem - cache building and aggregation', () => {
  test('builds semantic cache with combined fullDescriptor, fullVector, and chunks', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const vectorizeMock = mock((text: string) => [text.length, 99])
    const system = makeSystem(ecs, { vectorize: vectorizeMock })

    const entity = ecs.createEntity('hero', 'hero')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 80,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `Health: ${d.health}`)
    await system.onInit()

    const cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache).toBeDefined()
    expect(cache?.fullDescriptor).toBe(' ;; Health: 80')
    expect(cache?.fullVector).toEqual([' ;; Health: 80'.length, 99])
    expect(cache?.chunks).toEqual([['Health: 80', ['Health: 80'.length, 99]]])
  })

  test('default aggregator combines multiple component descriptors with delimiter', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    ecs.registerComponent('stats')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('hero', 'hero')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 50,
      statusEffects: [],
    })
    ecs.setComponentOnEntity(entity, 'stats', {
      strength: 20,
      defense: 12,
    })

    system.registerResolver('damage', (d) => `HP: ${d.health}`)
    system.registerResolver('stats', (s) => `STR: ${s.strength}`)
    await system.onInit()

    const cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain(';;')
    expect(cache?.fullDescriptor).toContain('HP: 50')
    expect(cache?.fullDescriptor).toContain('STR: 20')
    expect(cache?.chunks?.length).toBe(2)
    const chunkTexts = cache?.chunks?.map(([text]) => text)
    expect(chunkTexts).toContain('HP: 50')
    expect(chunkTexts).toContain('STR: 20')
  })

  test('customDescriptorAggregator is used when provided in config', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    ecs.registerComponent('stats')

    const system = makeSystem(ecs, {
      customDescriptorAggregator: customAggregator,
    })

    const entity = ecs.createEntity('hero', 'hero')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 90,
      statusEffects: [],
    })
    ecs.setComponentOnEntity(entity, 'stats', {
      strength: 14,
      defense: 8,
    })

    system.registerResolver('damage', (d) => `HP ${d.health}`)
    system.registerResolver('stats', (s) => `STR ${s.strength}`)
    await system.onInit()

    const cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain(' --- ')
    expect(cache?.chunks?.map(([text]) => text)).toContain('CHUNK: HP 90')
    expect(cache?.chunks?.map(([text]) => text)).toContain('CHUNK: STR 14')
  })
})

// ─── Entity Eligibility & Noun Requirements ─────────────────────────

describe('SemanticCacheSystem - noun and component requirements', () => {
  test('skips building cache and removes SemanticCache if entity has no Noun', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    // Create entity without a noun
    const entity = ecs.createEntity('unnamed-object')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(false)
  })

  test('skips building cache if entity Noun value is empty', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('empty-noun', '')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(false)
  })

  test('removes existing SemanticCache if entity Noun is cleared', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()
    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(true)

    ecs.updateComponentData(entity, 'Noun', { noun: '' })
    await system.onRun()

    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(false)
  })

  test('skips building cache if entity has Noun but no components with resolvers', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    ecs.registerComponent('color')
    const system = makeSystem(ecs)

    // Entity only has 'color', but resolver is only registered for 'damage'
    const entity = ecs.createEntity('rock', 'rock')
    ecs.setComponentOnEntity(entity, 'color', { name: 'gray' })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(false)
  })

  test('throws if dirty entity does not exist in ECS', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)
    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    // Mock getDirtyEntitiesByComponentRevision to return a non-existent entity ID
    const originalGetDirty = ecs.getDirtyEntitiesByComponentRevision.bind(ecs)
    ecs.getDirtyEntitiesByComponentRevision = (comp, rev) => {
      if (comp === SYSTEM_SCHEMA_COMPONENTS.noun) {
        return new Set([999999])
      }
      return originalGetDirty(comp, rev)
    }

    expect(system.onRun()).rejects.toThrow('no such entity exists')
  })
})

// ─── Revision Tracking & Incremental Rebuilding ─────────────────────

describe('SemanticCacheSystem - revisions and dirty tracking', () => {
  test('builds cache for pre-existing entities during onInit', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 75,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)

    expect(ecs.isComponent('SemanticCache')).toBe(false)
    await system.onInit()
    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(true)
  })

  test('rebuilds cache when resolved component data is updated via updateComponentData', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    let cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain('health: 100')

    ecs.updateComponentData(entity, 'damage', { health: 40 })
    await system.onRun()

    cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain('health: 40')
  })

  test('rebuilds cache when resolved component data is overwritten via setComponentOnEntity', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    ecs.setComponentOnEntity(entity, 'damage', {
      health: 20,
      statusEffects: ['frozen'],
    })
    await system.onRun()

    const cache = ecs.getEntityComponentData(entity, 'SemanticCache')
    expect(cache?.fullDescriptor).toContain('health: 20')
  })

  test('rebuilds cache when Noun component data is modified', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    ecs.updateComponentData(entity, 'Noun', { noun: 'hobgoblin' })
    await system.onRun()

    expect(ecs.entityHasComponent(entity, 'SemanticCache')).toBe(true)
  })

  test('does not rebuild cache for unmodified entities on subsequent runs', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const vectorizeMock = mock((text: string) => [text.length])
    const system = makeSystem(ecs, { vectorize: vectorizeMock })

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    const callsAfterInit = vectorizeMock.mock.calls.length
    expect(callsAfterInit).toBeGreaterThan(0)

    // Run again without any ECS changes
    await system.onRun()
    expect(vectorizeMock.mock.calls.length).toBe(callsAfterInit)
  })

  test('does not rebuild cache when an unrelated component without a resolver is modified', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    ecs.registerComponent('unrelated')
    const vectorizeMock = mock((text: string) => [text.length])
    const system = makeSystem(ecs, { vectorize: vectorizeMock })

    const entity = ecs.createEntity('goblin', 'goblin')
    ecs.setComponentOnEntity(entity, 'damage', {
      health: 100,
      statusEffects: [],
    })
    ecs.setComponentOnEntity(entity, 'unrelated', { secret: true })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    const callsAfterInit = vectorizeMock.mock.calls.length

    // Modify unrelated component
    ecs.updateComponentData(entity, 'unrelated', { secret: false })
    await system.onRun()

    expect(vectorizeMock.mock.calls.length).toBe(callsAfterInit)
  })

  test('rebuilds only the modified entity when multiple entities exist', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    const system = makeSystem(ecs)

    const entity1 = ecs.createEntity('goblin1', 'goblin1')
    ecs.setComponentOnEntity(entity1, 'damage', {
      health: 100,
      statusEffects: [],
    })

    const entity2 = ecs.createEntity('goblin2', 'goblin2')
    ecs.setComponentOnEntity(entity2, 'damage', {
      health: 200,
      statusEffects: [],
    })

    system.registerResolver('damage', (d) => `health: ${d.health}`)
    await system.onInit()

    // Only modify entity2
    ecs.updateComponentData(entity2, 'damage', { health: 150 })
    await system.onRun()

    const cache1 = ecs.getEntityComponentData(entity1, 'SemanticCache')
    const cache2 = ecs.getEntityComponentData(entity2, 'SemanticCache')

    expect(cache1?.fullDescriptor).toContain('health: 100')
    expect(cache2?.fullDescriptor).toContain('health: 150')
  })

  test('rebuilds entities matching ANY stale resolver when multiple resolvers are stale', async () => {
    const ecs = makeECS()
    ecs.registerComponent('damage')
    ecs.registerComponent('stats')
    const system = makeSystem(ecs)

    // entityA has only damage
    const entityA = ecs.createEntity('fighter', 'fighter')
    ecs.setComponentOnEntity(entityA, 'damage', {
      health: 100,
      statusEffects: [],
    })

    // entityB has only stats
    const entityB = ecs.createEntity('mage', 'mage')
    ecs.setComponentOnEntity(entityB, 'stats', {
      strength: 5,
      defense: 8,
    })

    // Register both resolvers before init (both are in staleResolvers)
    system.registerResolver('damage', (d) => `HP: ${d.health}`)
    system.registerResolver('stats', (s) => `STR: ${s.strength}`)
    await system.onInit()

    // Both entityA and entityB must have their cache built, even though neither has BOTH components
    expect(ecs.entityHasComponent(entityA, 'SemanticCache')).toBe(true)
    expect(ecs.entityHasComponent(entityB, 'SemanticCache')).toBe(true)

    const cacheA = ecs.getEntityComponentData(entityA, 'SemanticCache')
    const cacheB = ecs.getEntityComponentData(entityB, 'SemanticCache')

    expect(cacheA?.fullDescriptor).toContain('HP: 100')
    expect(cacheB?.fullDescriptor).toContain('STR: 5')
  })
})
