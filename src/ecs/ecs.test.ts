import { describe, expect, test } from 'bun:test'

import ECS, { type EngineComponentSchema } from '@/ecs/ecs'

interface TestSchema extends EngineComponentSchema {
  position: { x: number; y: number }
  velocity: { x: number; y: number }
  health: { current: number; max: number }
  stats: { strength: number; intelligence: number; dexterity: number }
  label: { text: string }
  nested: { a: { b: number } }
}

function makeECS() {
  return new ECS<TestSchema>()
}

// ─── createEntity ───────────────────────────────────────────────────

describe('createEntity', () => {
  test('returns incrementing entity IDs starting at 1', () => {
    const ecs = makeECS()
    expect(ecs.createEntity()).toBe(1)
    expect(ecs.createEntity()).toBe(2)
    expect(ecs.createEntity()).toBe(3)
  })

  test('new entity is active', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(ecs.entityExists(e)).toBe(true)
  })

  test('new entity has Tags and Meta components', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(ecs.entityHasComponent(e, 'Tags')).toBe(true)
    expect(ecs.entityHasComponent(e, 'Meta')).toBe(true)
  })

  test('Meta component has default name and id', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    const meta = ecs.getEntityComponentData(e, 'Meta')
    expect(meta.name).toBe('Entity_1')
    expect(meta.id).toBe('entity_1')
    expect(typeof meta.created).toBe('number')
  })

  test('Meta component uses provided metaId', () => {
    const ecs = makeECS()
    const e = ecs.createEntity('player-1')
    const meta = ecs.getEntityComponentData(e, 'Meta')
    expect(meta.id).toBe('player-1')
  })

  test('getEntityByPrettyId returns entity created with metaId', () => {
    const ecs = makeECS()
    const e = ecs.createEntity('hero')
    expect(ecs.getEntityByPrettyId('hero')).toBe(e)
  })

  test('throws when creating entity with duplicate metaId', () => {
    const ecs = makeECS()
    ecs.createEntity('unique-id')
    expect(() => ecs.createEntity('unique-id')).toThrow()
  })
})

// ─── defineComponent ────────────────────────────────────────────────

describe('defineComponent', () => {
  test('returns the component name', () => {
    const ecs = makeECS()
    expect(ecs.defineComponent('position')).toBe('position')
  })

  test('throws when defining a component that already exists', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    expect(() => ecs.defineComponent('position')).toThrow('already exists')
  })

  test('throws when redefining built-in Tags component', () => {
    const ecs = makeECS()
    expect(() => ecs.defineComponent('Tags' as any)).toThrow('already exists')
  })

  test('throws when redefining built-in Meta component', () => {
    const ecs = makeECS()
    expect(() => ecs.defineComponent('Meta' as any)).toThrow('already exists')
  })
})

// ─── isComponent ────────────────────────────────────────────────────

describe('isComponent', () => {
  test('returns true for defined components', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    expect(ecs.isComponent('position')).toBe(true)
  })

  test('returns true for built-in components', () => {
    const ecs = makeECS()
    expect(ecs.isComponent('Tags')).toBe(true)
    expect(ecs.isComponent('Meta')).toBe(true)
  })

  test('returns false for undefined components', () => {
    const ecs = makeECS()
    expect(ecs.isComponent('nonexistent')).toBe(false)
  })
})

// ─── setComponentOnEntity ───────────────────────────────────────────

describe('setComponentOnEntity', () => {
  test('sets and retrieves component data', () => {
    const ecs = makeECS()
    ecs.defineComponent('health')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'health', {
      current: 100,
      max: 100,
    })
    expect(ecs.getEntityComponentData(e, 'health')).toEqual({
      current: 100,
      max: 100,
    })
  })

  test('overwrites existing component data', () => {
    const ecs = makeECS()
    ecs.defineComponent('health')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'health', {
      current: 100,
      max: 100,
    })
    ecs.setComponentOnEntity(e, 'health', {
      current: 50,
      max: 150,
    })
    expect(ecs.getEntityComponentData(e, 'health')).toEqual({
      current: 50,
      max: 150,
    })
  })

  test('throws for unknown component type', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(() => {
      ecs.setComponentOnEntity(e, 'undefinedComponent' as any, {})
    }).toThrow('unknown component type: undefinedComponent')
  })

  test('throws for non-existent entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    expect(() => {
      ecs.setComponentOnEntity(999, 'position', {
        x: 0,
        y: 0,
      })
    }).toThrow('entity does not exist')
  })

  test('throws for destroyed entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.destroyEntity(e)
    expect(() => {
      ecs.setComponentOnEntity(e, 'position', {
        x: 0,
        y: 0,
      })
    }).toThrow('entity is destroyed')
  })
})

// ─── updateComponentData ────────────────────────────────────────────

describe('updateComponentData', () => {
  test('merges partial data into existing component', () => {
    const ecs = makeECS()
    ecs.defineComponent('stats')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'stats', {
      strength: 10,
      intelligence: 8,
      dexterity: 12,
    })
    ecs.updateComponentData(e, 'stats', { strength: 15 })
    expect(ecs.getEntityComponentData(e, 'stats')).toEqual({
      strength: 15,
      intelligence: 8,
      dexterity: 12,
    })
  })

  test('merges multiple fields at once', () => {
    const ecs = makeECS()
    ecs.defineComponent('stats')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'stats', {
      strength: 10,
      intelligence: 8,
      dexterity: 12,
    })
    ecs.updateComponentData(e, 'stats', {
      intelligence: 10,
      dexterity: 14,
    })
    expect(ecs.getEntityComponentData(e, 'stats')).toEqual({
      strength: 10,
      intelligence: 10,
      dexterity: 14,
    })
  })

  test('demonstrates shallow merge behavior (nested objects are overwritten)', () => {
    const ecs = makeECS()
    ecs.defineComponent('nested')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'nested', { a: { b: 1 } })

    // This will overwrite the whole 'a' object, not merge {b: 1} with {c: 2}
    ecs.updateComponentData(e, 'nested', { a: { c: 2 } } as any)

    const data = ecs.getEntityComponentData(e, 'nested')
    expect(data.a).toEqual({ c: 2 } as any)
    expect((data.a as any).b).toBeUndefined()
  })

  test('throws for unknown component type', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(() => {
      ecs.updateComponentData(e, 'undefinedComponent' as any, { x: 0 })
    }).toThrow('Unknown component type: undefinedComponent')
  })

  test('throws for non-existent entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    expect(() => {
      ecs.updateComponentData(999, 'position', { x: 1 })
    }).toThrow('entity does not exist')
  })

  test('throws for destroyed entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 0,
      y: 0,
    })
    ecs.destroyEntity(e)
    expect(() => {
      ecs.updateComponentData(e, 'position', { x: 5 })
    }).toThrow('entity is destroyed')
  })

  test('throws when entity does not have the component', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    expect(() => {
      ecs.updateComponentData(e, 'position', { x: 5 })
    }).toThrow('entity does not have component position')
  })
})

// ─── removeComponentFromEntity ──────────────────────────────────────

describe('removeComponentFromEntity', () => {
  test('removes a component from an entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 1,
      y: 2,
    })
    expect(ecs.entityHasComponent(e, 'position')).toBe(true)
    ecs.removeComponentFromEntity(e, 'position')
    expect(ecs.entityHasComponent(e, 'position')).toBe(false)
  })

  test('throws for unknown component type', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(() => {
      ecs.removeComponentFromEntity(e, 'fake' as any)
    }).toThrow('unknown component type: fake')
  })

  test('throws for non-existent entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    expect(() => {
      ecs.removeComponentFromEntity(999, 'position')
    }).toThrow('entity does not exist')
  })

  test('throws for destroyed entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.destroyEntity(e)
    expect(() => {
      ecs.removeComponentFromEntity(e, 'position')
    }).toThrow('entity is destroyed')
  })
})

// ─── getEntityComponentData ─────────────────────────────────────────

describe('getEntityComponentData', () => {
  test('returns frozen (readonly) data', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 1,
      y: 2,
    })
    const data = ecs.getEntityComponentData(e, 'position')
    expect(Object.isFrozen(data)).toBe(true)
  })

  test('returned data is deep-frozen', () => {
    const ecs = makeECS()
    ecs.defineComponent('nested')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'nested', { a: { b: 1 } })
    const data = ecs.getEntityComponentData(e, 'nested')
    expect(Object.isFrozen(data)).toBe(true)
    expect(Object.isFrozen(data.a)).toBe(true)
  })

  test('returned data is a deep clone (mutations do not affect store)', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 1,
      y: 2,
    })
    const data1 = ecs.getEntityComponentData(e, 'position')
    const data2 = ecs.getEntityComponentData(e, 'position')
    expect(data1).toEqual(data2)
    expect(data1).not.toBe(data2) // different references
  })

  test('throws when entity does not have the component', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    expect(() => {
      ecs.getEntityComponentData(e, 'position')
    }).toThrow('entity does not have component position')
  })

  test('throws for destroyed entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 0,
      y: 0,
    })
    ecs.destroyEntity(e)
    expect(() => {
      ecs.getEntityComponentData(e, 'position')
    }).toThrow()
  })
})

// ─── entityHasComponent ─────────────────────────────────────────────

describe('entityHasComponent', () => {
  test('returns true when entity has the component', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 0,
      y: 0,
    })
    expect(ecs.entityHasComponent(e, 'position')).toBe(true)
  })

  test('returns false when entity lacks the component', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    expect(ecs.entityHasComponent(e, 'position')).toBe(false)
  })

  test('throws for non-existent entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    expect(() => ecs.entityHasComponent(999, 'position')).toThrow('entity does not exist')
  })

  test('throws for destroyed entity', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.destroyEntity(e)
    expect(() => ecs.entityHasComponent(e, 'Tags')).toThrow('entity is destroyed')
  })

  test('throws for unknown component type', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(() => ecs.entityHasComponent(e, 'nope' as any)).toThrow('component nope does not exist')
  })
})

// ─── getComponentsOnEntity ──────────────────────────────────────────

describe('getComponentsOnEntity', () => {
  test('returns built-in components for a fresh entity', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    const components = ecs.getComponentsOnEntity(e)
    expect(components).toContain('Tags')
    expect(components).toContain('Meta')
  })

  test('includes user-defined components', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    ecs.defineComponent('velocity')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 0,
      y: 0,
    })
    const components = ecs.getComponentsOnEntity(e)
    expect(components).toContain('position')
    expect(components).not.toContain('velocity')
  })

  test('reflects removal of components', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 0,
      y: 0,
    })
    ecs.removeComponentFromEntity(e, 'position')
    expect(ecs.getComponentsOnEntity(e)).not.toContain('position')
  })
})

// ─── getEntitiesByComponents ────────────────────────────────────────

describe('getEntitiesByComponents', () => {
  test('returns empty array for no component types', () => {
    const ecs = makeECS()
    expect(ecs.getEntitiesByComponents()).toEqual([])
  })

  test('returns entities matching a single component', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e1 = ecs.createEntity()
    const e2 = ecs.createEntity()
    ecs.setComponentOnEntity(e1, 'position', {
      x: 0,
      y: 0,
    })
    ecs.setComponentOnEntity(e2, 'position', {
      x: 1,
      y: 1,
    })
    expect(ecs.getEntitiesByComponents('position')).toEqual([e1, e2])
  })

  test('returns entities matching multiple components', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    ecs.defineComponent('velocity')
    const e1 = ecs.createEntity()
    const e2 = ecs.createEntity()
    ecs.setComponentOnEntity(e1, 'position', {
      x: 0,
      y: 0,
    })
    ecs.setComponentOnEntity(e1, 'velocity', {
      x: 1,
      y: 1,
    })
    ecs.setComponentOnEntity(e2, 'position', {
      x: 0,
      y: 0,
    })
    expect(ecs.getEntitiesByComponents('position', 'velocity')).toEqual([e1])
  })

  test('optimizes intersection by starting with the smallest store', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    ecs.defineComponent('velocity')

    // 100 entities with position
    for (let i = 0; i < 100; i++) {
      const e = ecs.createEntity()
      ecs.setComponentOnEntity(e, 'position', {
        x: i,
        y: 0,
      })
      if (i === 50) {
        ecs.setComponentOnEntity(e, 'velocity', {
          x: 1,
          y: 1,
        })
      }
    }

    // velocity store has only 1 entity.
    // getEntitiesByComponents should pick velocity store first.
    const result = ecs.getEntitiesByComponents('position', 'velocity')
    expect(result.length).toBe(1)
    expect(ecs.getEntityComponentData(result[0]!, 'position').x).toBe(50)
  })

  test('throws for unknown component types', () => {
    const ecs = makeECS()
    expect(() => ecs.getEntitiesByComponents('nope' as any)).toThrow('do not exist')
  })

  test('does not return destroyed entities', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e1 = ecs.createEntity()
    const e2 = ecs.createEntity()
    ecs.setComponentOnEntity(e1, 'position', {
      x: 0,
      y: 0,
    })
    ecs.setComponentOnEntity(e2, 'position', {
      x: 1,
      y: 1,
    })
    ecs.destroyEntity(e1)
    expect(ecs.getEntitiesByComponents('position')).toEqual([e2])
  })

  test('returns empty when no entities have the components', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    ecs.createEntity() // no position set
    expect(ecs.getEntitiesByComponents('position')).toEqual([])
  })
})

// ─── destroyEntity ──────────────────────────────────────────────────

describe('destroyEntity', () => {
  test('entity no longer exists after destruction', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.destroyEntity(e)
    expect(ecs.entityExists(e)).toBe(false)
  })

  test('clears all component data for destroyed entity', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 1,
      y: 2,
    })
    ecs.destroyEntity(e)
    // entity is gone; querying components should not find it
    expect(ecs.getEntitiesByComponents('position')).toEqual([])
  })

  test('destroying same entity twice throws', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.destroyEntity(e)
    expect(() => ecs.destroyEntity(e)).toThrow('entity is destroyed')
  })

  test('new entity after destruction gets a new ID', () => {
    const ecs = makeECS()
    const e1 = ecs.createEntity()
    ecs.destroyEntity(e1)
    const e2 = ecs.createEntity()
    expect(e2).not.toBe(e1)
    expect(e2).toBe(2)
  })
})

// ─── Tags ───────────────────────────────────────────────────────────

describe('addTagToEntity / entityHasTag', () => {
  test('adds and checks a tag', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.addTagToEntity(e, 'player')
    expect(ecs.entityHasTag(e, 'player')).toBe(true)
  })

  test('returns false for tags not added', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(ecs.entityHasTag(e, 'enemy')).toBe(false)
  })

  test('supports multiple tags on one entity', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.addTagToEntity(e, 'player')
    ecs.addTagToEntity(e, 'alive')
    expect(ecs.entityHasTag(e, 'player')).toBe(true)
    expect(ecs.entityHasTag(e, 'alive')).toBe(true)
  })

  test('adding duplicate tag is idempotent', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.addTagToEntity(e, 'x')
    ecs.addTagToEntity(e, 'x')
    expect(ecs.entityHasTag(e, 'x')).toBe(true)
  })

  test('entityHasTag throws for destroyed entity', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.addTagToEntity(e, 'test')
    ecs.destroyEntity(e)
    expect(() => ecs.entityHasTag(e, 'test')).toThrow()
  })
})

// ─── entityExists ───────────────────────────────────────────────────

describe('entityExists', () => {
  test('returns true for active entity', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(ecs.entityExists(e)).toBe(true)
  })

  test('returns false for never-created entity', () => {
    const ecs = makeECS()
    expect(ecs.entityExists(999)).toBe(false)
  })

  test('returns false for destroyed entity', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    ecs.destroyEntity(e)
    expect(ecs.entityExists(e)).toBe(false)
  })
})

// ─── getEntityByPrettyId ────────────────────────────────────────────

describe('getEntityByPrettyId', () => {
  test('returns undefined for unknown pretty ID', () => {
    const ecs = makeECS()
    expect(ecs.getEntityByPrettyId('nope')).toBeUndefined()
  })

  test('returns entity for auto-generated pretty ID', () => {
    const ecs = makeECS()
    const e = ecs.createEntity()
    expect(ecs.getEntityByPrettyId('entity_1')).toBe(e)
  })
})

// ─── getReadonlyFacade ──────────────────────────────────────────────

describe('getReadonlyFacade', () => {
  test('facade exposes read-only methods', () => {
    const ecs = makeECS()
    const facade = ecs.getReadonlyFacade()
    expect(typeof facade.entityExists).toBe('function')
    expect(typeof facade.entityHasTag).toBe('function')
    expect(typeof facade.entityHasComponent).toBe('function')
    expect(typeof facade.getEntitiesByComponents).toBe('function')
    expect(typeof facade.getComponentsOnEntity).toBe('function')
    expect(typeof facade.getEntityComponentData).toBe('function')
  })

  test('facade methods work correctly', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    const e = ecs.createEntity()
    ecs.setComponentOnEntity(e, 'position', {
      x: 5,
      y: 10,
    })
    ecs.addTagToEntity(e, 'hero')

    const facade = ecs.getReadonlyFacade()
    expect(facade.entityExists(e)).toBe(true)
    expect(facade.entityHasTag(e, 'hero')).toBe(true)
    expect(facade.entityHasComponent(e, 'position')).toBe(true)
    expect(facade.getEntityComponentData(e, 'position')).toEqual({
      x: 5,
      y: 10,
    })
    expect(facade.getEntitiesByComponents('position')).toEqual([e])
    expect(facade.getComponentsOnEntity(e)).toContain('position')
  })

  test('facade does not expose mutation methods', () => {
    const ecs = makeECS()
    const facade = ecs.getReadonlyFacade()
    expect((facade as any).createEntity).toBeUndefined()
    expect((facade as any).destroyEntity).toBeUndefined()
    expect((facade as any).setComponentOnEntity).toBeUndefined()
    expect((facade as any).updateComponentData).toBeUndefined()
    expect((facade as any).removeComponentFromEntity).toBeUndefined()
    expect((facade as any).defineComponent).toBeUndefined()
    expect((facade as any).addTagToEntity).toBeUndefined()
  })
})

// ─── Systems ────────────────────────────────────────────────────────

describe('Systems', () => {
  test('registerSystem adds a system and systems getter retrieves it', () => {
    const ecs = makeECS()
    const system = {
      name: 'test-system',
      run: async () => {},
    }
    ecs.registerSystem(system)
    const systems = ecs.systems
    expect(systems.length).toBe(1)
    expect(systems[0]?.name).toBe('test-system')
  })

  test('systems are returned in priority order (ascending)', () => {
    const ecs = makeECS()
    const s1 = {
      name: 's1',
      priority: 100,
      run: async () => {},
    }
    const s2 = {
      name: 's2',
      priority: 10,
      run: async () => {},
    }
    const s3 = {
      name: 's3',
      priority: 50,
      run: async () => {},
    }

    ecs.registerSystem(s1)
    ecs.registerSystem(s2)
    ecs.registerSystem(s3)

    const systems = ecs.systems
    expect(systems[0]?.name).toBe('s2')
    expect(systems[1]?.name).toBe('s3')
    expect(systems[2]?.name).toBe('s1')
  })

  test('systems use default priority when none is provided', () => {
    // Default priority set to 25
    const ecs = new ECS<TestSchema>(undefined, 25)
    const s1 = {
      name: 's1',
      priority: 50,
      run: async () => {},
    }
    const s2 = {
      name: 's2',
      run: async () => {},
    } // should be 25
    const s3 = {
      name: 's3',
      priority: 10,
      run: async () => {},
    }

    ecs.registerSystem(s1)
    ecs.registerSystem(s2)
    ecs.registerSystem(s3)

    const systems = ecs.systems
    expect(systems[0]?.name).toBe('s3')
    expect(systems[1]?.name).toBe('s2')
    expect(systems[2]?.name).toBe('s1')
  })

  test('deregisterSystem removes a system', () => {
    const ecs = makeECS()
    const s1 = {
      name: 's1',
      run: async () => {},
    }
    ecs.registerSystem(s1)
    expect(ecs.systems.length).toBe(1)
    ecs.deregisterSystem('s1')
    expect(ecs.systems.length).toBe(0)
  })

  test('registerSystem throws on duplicate name', () => {
    const ecs = makeECS()
    const s1 = {
      name: 's1',
      run: async () => {},
    }
    ecs.registerSystem(s1)
    expect(() =>
      ecs.registerSystem({
        name: 's1',
        run: async () => {},
      }),
    ).toThrow()
  })

  test('deregisterSystem throws if system not found', () => {
    const ecs = makeECS()
    expect(() => ecs.deregisterSystem('nope')).toThrow()
  })

  test('systems getter returns a frozen array with frozen items', () => {
    const ecs = makeECS()
    ecs.registerSystem({
      name: 's1',
      run: async () => {},
    })
    const systems = ecs.systems

    // The array itself is frozen
    expect(Object.isFrozen(systems)).toBe(true)
    expect(() =>
      (systems as any).push({
        name: 's2',
        run: async () => {},
      }),
    ).toThrow()

    // The items inside are frozen clones
    const s1 = systems[0]!
    expect(Object.isFrozen(s1)).toBe(true)
    expect(() => {
      ;(s1 as any).name = 'new name'
    }).toThrow()
  })
})

// ─── multi-entity integration ───────────────────────────────────────

describe('multi-entity integration', () => {
  test('full lifecycle: create, add components, query, update, destroy', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    ecs.defineComponent('velocity')
    ecs.defineComponent('health')

    const player = ecs.createEntity()
    const enemy = ecs.createEntity()
    const projectile = ecs.createEntity()

    ecs.setComponentOnEntity(player, 'position', {
      x: 0,
      y: 0,
    })
    ecs.setComponentOnEntity(player, 'velocity', {
      x: 1,
      y: 0,
    })
    ecs.setComponentOnEntity(player, 'health', {
      current: 100,
      max: 100,
    })

    ecs.setComponentOnEntity(enemy, 'position', {
      x: 10,
      y: 10,
    })
    ecs.setComponentOnEntity(enemy, 'health', {
      current: 50,
      max: 50,
    })

    ecs.setComponentOnEntity(projectile, 'position', {
      x: 0,
      y: 0,
    })
    ecs.setComponentOnEntity(projectile, 'velocity', {
      x: 5,
      y: 5,
    })

    // entities with position + velocity (player and projectile)
    const movers = ecs.getEntitiesByComponents('position', 'velocity')
    expect(movers).toContain(player)
    expect(movers).toContain(projectile)
    expect(movers).not.toContain(enemy)

    // entities with health
    const livingThings = ecs.getEntitiesByComponents('health')
    expect(livingThings).toContain(player)
    expect(livingThings).toContain(enemy)

    // update enemy health
    ecs.updateComponentData(enemy, 'health', { current: 0 })
    expect(ecs.getEntityComponentData(enemy, 'health')).toEqual({
      current: 0,
      max: 50,
    })

    // destroy projectile
    ecs.destroyEntity(projectile)
    expect(ecs.getEntitiesByComponents('position', 'velocity')).toEqual([player])
    expect(ecs.entityExists(projectile)).toBe(false)
  })

  test('many entities with varied component sets', () => {
    const ecs = makeECS()
    ecs.defineComponent('position')
    ecs.defineComponent('label')

    const entities = Array.from({ length: 20 }, (_, i) => {
      const e = ecs.createEntity()
      ecs.setComponentOnEntity(e, 'position', {
        x: i,
        y: i * 2,
      })
      if (i % 3 === 0) {
        ecs.setComponentOnEntity(e, 'label', { text: `entity-${i}` })
      }
      return e
    })

    const withLabel = ecs.getEntitiesByComponents('position', 'label')
    // indices 0, 3, 6, 9, 12, 15, 18 → 7 entities
    expect(withLabel.length).toBe(7)

    const allPositioned = ecs.getEntitiesByComponents('position')
    expect(allPositioned.length).toBe(20)

    // destroy a few
    ecs.destroyEntity(entities[0]!)
    ecs.destroyEntity(entities[3]!)
    expect(ecs.getEntitiesByComponents('position', 'label').length).toBe(5)
    expect(ecs.getEntitiesByComponents('position').length).toBe(18)
  })
})
