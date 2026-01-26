export type Entity = number

interface EngineComponentSchema {
    Tags: { list: Set<string> };
    Meta: { name: string; created: number };
}

export default class ECS<ComponentSchema extends EngineComponentSchema = EngineComponentSchema> {
    #nextEntityId = 1
    #activeEntities = new Set<number>()
    #components = new Map<
        keyof ComponentSchema,
        Map<Entity, ComponentSchema[keyof ComponentSchema]>
    >()

    constructor() {
        // Bootstrap the required system components
        this.#components.set('Tags', new Map());
        this.#components.set('Meta', new Map());
    }

    defineComponent<ComponentName extends keyof ComponentSchema>(name: ComponentName) {
        if (this.#components.has(name)) {
            throw new Error(`Component named ${String(name)} already exists`)
        }

        this.#components.set(name, new Map())

        return name
    }

    createEntity() {
        const id = this.#nextEntityId++

        this.#activeEntities.add(id)

        this.addComponentToEntity(id, 'Tags', { list: new Set<string>() })
        this.addComponentToEntity(id, 'Meta', { name: `Entity_${id}`, created: Date.now() })

        return id
    }

    addComponentToEntity<ComponentName extends keyof ComponentSchema & string>(
        entity: number,
        name: ComponentName,
        data: ComponentSchema[ComponentName]
    ): void {
        const store = this.#components.get(name);

        if (!store) {
            throw new Error(`Unknown component type: ${name}`)
        }

        store.set(entity, data)
    }

    removeComponentFromEntity<ComponentName extends keyof ComponentSchema>(
        entity: Entity,
        componentType: ComponentName,
    ) {
        this.#components.get(componentType)?.delete(entity)
    }

    getComponentData<ComponentName extends keyof ComponentSchema>(
        entity: number,
        name: ComponentName,
    ): ComponentSchema[ComponentName] | undefined {
        const store = this.#components.get(name);
        return store?.get(entity) as ComponentSchema[ComponentName] | undefined;
    }

    entityHasComponent<ComponentName extends keyof ComponentSchema>(
        entity: Entity,
        componentType: ComponentName,
    ) {
        const component = this.#components.get(componentType)
        return !!component?.has(entity)
    }

    getComponentsOnEntity<ComponentName extends keyof ComponentSchema>(
        entity: Entity
    ): ComponentName[] {
        return Array.from(this.#components).flatMap(([componentName]) =>
            this.entityHasComponent(entity, componentName)
                ? [componentName as ComponentName]
                : []
        )
    }

    getEntitiesByComponents<ComponentName extends keyof ComponentSchema>(
        ...componentTypes: ComponentName[]
    ): Entity[] {
        if (componentTypes.length === 0) return [];

        const sortedTypes = componentTypes.sort((a, b) => {
            return (this.#components.get(a)?.size ?? 0) - (this.#components.get(b)?.size ?? 0);
        });

        const [smallestType, ...rest] = sortedTypes;

        if (!smallestType) {
            console.warn('There was an issue while fetching components');
            return [];
        }
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

    addTag(entity: Entity, tag: string) {
        const tagData = this.getComponentData(entity, 'Tags');

        tagData!.list.add(tag);
    }

    hasTag(entity: Entity, tag: string) {
        const tagData = this.getComponentData(entity, 'Tags');
        return tagData?.list.has(tag) ?? false;
    }
}
