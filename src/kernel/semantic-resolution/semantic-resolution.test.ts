import { describe, expect, test, spyOn } from 'bun:test'
import EventBus, { defaultEmitStreams } from '@/helpers/event-bus/event-bus'
import { DefaultLogger } from '@/helpers/logger/logger'
import ECS from '@/kernel/ecs/ecs'
import type { EngineComponentSchema } from '@/kernel/ecs/ecs.types'
import { createSemanticResolutionSystem } from '@/kernel/semantic-resolution/semantic-resolution.system'

interface TestSchema extends EngineComponentSchema {
    position: { x: number; y: number }
    name: { text: string }
    health: { hp: number }
}

function setup() {
    const logger = new DefaultLogger({ info: false, debug: false, error: false, warn: false })
    const eventBus = new EventBus()
    const ecs = new ECS<TestSchema>(eventBus, logger)
    ecs.defineComponent('position')
    ecs.defineComponent('name')
    ecs.defineComponent('health')

    const system = createSemanticResolutionSystem<TestSchema>(ecs.getReadonlyFacade(), eventBus, logger)

    return { logger, eventBus, ecs, system }
}

describe('SemanticResolutionSystem', () => {
    test('init sets up event bus listeners', () => {
        const { eventBus, system } = setup()
        system.init()

        expect(eventBus.listenerCount(defaultEmitStreams.ecsEntityCreated)).toBeGreaterThan(0)
        expect(eventBus.listenerCount(defaultEmitStreams.ecsEntityDestroyed)).toBeGreaterThan(0)
        expect(eventBus.listenerCount(defaultEmitStreams.ecsComponentModified)).toBeGreaterThan(0)

        system.dispose()
    })

    test('init handles being called multiple times', () => {
        const { logger, system } = setup()
        const warnSpy = spyOn(logger, 'warn')

        system.init()
        system.init()

        expect(warnSpy).toHaveBeenCalledWith('Cannot initialize Semantic Resolution System: already initialized')

        system.dispose()
    })

    test('dispose removes event bus listeners', () => {
        const { eventBus, system } = setup()
        system.init()
        system.dispose()

        expect(eventBus.listenerCount(defaultEmitStreams.ecsEntityCreated)).toBe(0)
        expect(eventBus.listenerCount(defaultEmitStreams.ecsEntityDestroyed)).toBe(0)
        expect(eventBus.listenerCount(defaultEmitStreams.ecsComponentModified)).toBe(0)
    })

    test('throws when getting descriptor for non-existent entity', () => {
        const { system } = setup()
        system.init()

        expect(() => system.getEntityDescriptor(999)).toThrow()

        system.dispose()
    })

    test('maintains cache when entities are created and destroyed', async () => {
        const { ecs, system } = setup()
        system.init()

        const entity = ecs.createEntity()
        // Wait for event bus to process
        await Bun.sleep(0)

        expect(system.getEntityDescriptor(entity)).toEqual(expect.objectContaining({ chunked: [], combined: '' }))
        ecs.destroyEntity(entity)
        await Bun.sleep(0)

        expect(() => system.getEntityDescriptor(entity)).toThrow()

        system.dispose()
    })

    test('registerResolver and component modification updates descriptor', async () => {
        const { ecs, system } = setup()
        system.init()

        system.registerResolver('name', (data) => `Name is ${data.text}`)
        system.registerResolver('position', (data) => `At [${data.x}, ${data.y}]`)

        const entity = ecs.createEntity()
        await Bun.sleep(0)

        ecs.setComponentOnEntity(entity, 'name', { text: 'Hero' })
        await Bun.sleep(0)

        let descriptor = system.getEntityDescriptor(entity)
        expect(descriptor?.combined).toContain('Name is Hero')
        expect(descriptor?.chunked.every(chunk => chunk === 'Name is Hero')).toBeTrue()

        ecs.setComponentOnEntity(entity, 'position', { x: 10, y: 20 })
        await Bun.sleep(0)

        descriptor = system.getEntityDescriptor(entity)
        expect(descriptor?.combined).toContain('Name is Hero')
        expect(descriptor?.combined).toContain('At [10, 20]')
        expect(descriptor?.chunked.some(chunk => chunk === 'Name is Hero')).toBeTrue()
        expect(descriptor?.chunked.some(chunk => chunk === 'At [10, 20]')).toBeTrue()

        system.dispose()
    })

    test('deregisterResolver removes resolver and clears existing cache entries', async () => {
        const { ecs, system } = setup()
        system.init()

        system.registerResolver('name', (data) => `Name is ${data.text}`)

        const entity = ecs.createEntity()
        await Bun.sleep(0)

        ecs.setComponentOnEntity(entity, 'name', { text: 'Hero' })
        await Bun.sleep(0)

        expect(system.getEntityDescriptor(entity)?.combined).toContain('Name is Hero')

        system.deregisterResolver('name')

        // Ensure cache entry for this component is removed
        expect(system.getEntityDescriptor(entity)?.combined).not.toContain('Name is Hero')

        system.dispose()
    })

    test('rebuildCache recreates cache from existing ECS state', () => {
        const { ecs, system } = setup()

        // Setup ECS state *before* system is initialized
        const entity1 = ecs.createEntity()
        ecs.setComponentOnEntity(entity1, 'name', { text: 'Alice' })

        const entity2 = ecs.createEntity()
        ecs.setComponentOnEntity(entity2, 'name', { text: 'Bob' })
        ecs.setComponentOnEntity(entity2, 'position', { x: 5, y: 5 })

        system.registerResolver('name', (data) => `Name: ${data.text}`)
        system.registerResolver('position', (data) => `Pos: ${data.x},${data.y}`)

        system.init()

        // Cache should be empty or warn since events were missed, but let's force rebuild
        system.rebuildCache()

        const desc1 = system.getEntityDescriptor(entity1)
        expect(desc1?.combined).toContain('Name: Alice')
        expect(desc1?.chunked.every(chunk => chunk === 'Name: Alice')).toBeTrue()

        const desc2 = system.getEntityDescriptor(entity2)
        expect(desc2?.combined).toContain('Name: Bob')
        expect(desc2?.combined).toContain('Pos: 5,5')
        expect(desc2?.chunked.some(chunk => chunk === 'Name: Bob')).toBeTrue()
        expect(desc2?.chunked.some(chunk => chunk === 'Pos: 5,5')).toBeTrue()


        system.dispose()
    })
})
