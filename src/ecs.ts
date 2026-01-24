type Entity = number
type DataProperty = string
type ComponentData = Record<DataProperty, unknown>
type ComponentName = string
type EntityComponents  = Map<Entity, ComponentData>
type ComponentRegistry = Map<ComponentName, EntityComponents>;

export default class ECS {
    #nextEntityId = 1
    #activeEntities = new Set<number>()

    #components = new Map<ComponentName, EntityComponents>() as ComponentRegistry

    get #entityCount() {
        return this.#nextEntityId;
    }

    defineComponent(name: ComponentName) {
        if (this.#components.has(name)) {
            throw new Error(`Component named ${name} already exists`)
        }

        this.#components.set(name, new Map())

        return name
    }

    createEntity() {
        const id = this.#nextEntityId++

        this.#activeEntities.add(id)

        return id
    }

    addComponentToEntity(
        entity: Entity,
        componentType: ComponentName,
        data: Record<string, unknown>
    ) {
        const store = this.#components.get(componentType);

        if (!store) {
            throw new Error(`Unknown component type: ${componentType}`)
        }

        store.set(entity, data)
    }

    removeComponentFromEntity(entity: Entity, componentType: ComponentName) {
        this.#components.get(componentType)?.delete(entity)
    }

    getComponentData(entity: Entity, componentType: ComponentName) {
        const store = this.#components.get(componentType)

        return store?.get(entity)
    }

    entityHasComponent(entity: Entity, componentType: ComponentName) {
        const component = this.#components.get(componentType)
        return !!component?.has(entity)
    }

    getComponentsOnEntity(entity: Entity): ComponentName[] {
        return Array.from(this.#components)
            .flatMap(([componentName]) =>
                this.entityHasComponent(entity, componentName)
                    ? [componentName]
                    : []
            )
    }

    getEntitiesWithComponents(...componentTypes: ComponentName[]): Entity[] {
        let componentWithFewestEntities: string = '';

        for (const componentType in componentTypes) {
            if (!componentWithFewestEntities) {
                componentWithFewestEntities = componentType
            }

            const numberOfEntitiesToCheck = this.#components.get(componentType)?.size ?? 0
            const numberOfEntitiesFewest = this.#components.get(componentWithFewestEntities)?.size ?? 0

            if (numberOfEntitiesToCheck < numberOfEntitiesFewest) {
                componentWithFewestEntities = componentType
            }
        }

        // eztodo resume here;
        /*
            The Fix: "Intersection of Smallest Set"
            In ECS, the standard optimization is to find which requested component has the fewest entities, iterate that one, and check the others.
            Query: [Location, Player, Wet]
            Counts:
            Location: 500 entities
            Player: 1 entity
            Wet: 5 entities
            Strategy: Don't check 500 locations. Grab the 1 Player entity and check "Is it Wet? Has Location?". You just did 2 checks instead of 1500.
        */
    }
}
