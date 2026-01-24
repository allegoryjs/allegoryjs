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

    getEntitiesByComponents(...componentTypes: ComponentName[]): Entity[] {
        if (componentTypes.length === 0) return [];

        const sortedTypes = componentTypes.sort((a, b) => {
            return (this.#components.get(a)?.size ?? 0) - (this.#components.get(b)?.size ?? 0);
        });

        const [smallestType, ...rest] = sortedTypes;
        const smallestStore = this.#components.get(smallestType);

        if (!smallestStore || smallestStore.size === 0) return [];

        const result: Entity[] = [];

        for (const entity of smallestStore.keys()) {
            const hasAll = rest.every(type => this.entityHasComponent(entity, type));
            if (hasAll) result.push(entity);
        }

        return result;
    }

    destroyEntity(entity: Entity) {
        for (const store of this.#components.values()) {
            store.delete(entity);
        }

        this.#activeEntities.delete(entity);
    }
}
