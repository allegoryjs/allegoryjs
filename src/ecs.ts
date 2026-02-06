import deepFreeze from './utilities/deepFreeze';

export type Entity = number

export interface EngineComponentSchema {
    Tags: {
        list: Set<string>
    }

    Meta: {
        name: string
        created: number

        // pretty ID set by the developer; not to be confused
        // with the entity ID, which is an integer
        id: string
    }
}

export default class ECS<ComponentSchema extends EngineComponentSchema = EngineComponentSchema> {
    #nextEntityId = 1
    #activeEntities = new Set<number>()
    #components = new Map<
        keyof ComponentSchema,
        Map<Entity, ComponentSchema[keyof ComponentSchema]>
    >()
    #prettyIdMap = new Map<string, Entity>()

    constructor() {
        // Bootstrap the required system components
        this.#components.set('Tags', new Map());
        this.#components.set('Meta', new Map());
    }

    isComponent(name: string): name is keyof ComponentSchema & string {
        return (Array.from(this.#components.keys()) as string[]).includes(name)
    }

    defineComponent<ComponentName extends keyof ComponentSchema>(name: ComponentName) {
        if (this.#components.has(name)) {
            throw new Error(`Component named ${String(name)} already exists`)
        }

        this.#components.set(name, new Map())

        return name
    }

    createEntity(metaId?: string) {
        if (metaId && this.#prettyIdMap.has(metaId)) {
            throw new Error(`Cannot register new entity with pretty ID ${metaId}; entity ${this.#prettyIdMap.get(metaId)} already is already assigned that ID`)
        }
        const id = this.#nextEntityId++

        this.#activeEntities.add(id)

        this.setComponentOnEntity(id, 'Tags', { list: new Set<string>() })
        this.setComponentOnEntity(
            id,
            'Meta',
            {
                name: `Entity_${id}`,
                id: metaId || `entity_${id}`,
                created: Date.now()
            }
        )

        return id
    }

    // destructive; overwrites existing component data, if any
    setComponentOnEntity<ComponentName extends keyof ComponentSchema & string>(
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

    // merge component data with new data
    updateComponentData<ComponentName extends keyof ComponentSchema & string> (
        entity: number,
        name: ComponentName,
        data: Partial<ComponentSchema[ComponentName]>
    ) {
        const store = this.#components.get(name);

        if (!store) {
            throw new Error(`Unknown component type: ${name}`)
        }

        store.set(entity, {
            ...store.get(entity),
            ...data
        })
    }

    removeComponentFromEntity<ComponentName extends keyof ComponentSchema>(
        entity: Entity,
        componentType: ComponentName,
    ) {
        this.#components.get(componentType)?.delete(entity)
    }

    getEntityComponentData<ComponentName extends keyof ComponentSchema>(
        entity: Entity,
        name: ComponentName,
    ): Readonly<ComponentSchema[ComponentName]> | undefined {
        const store = this.#components.get(name);
        return store?.get(entity)
            ? deepFreeze(store.get(entity) as ComponentSchema[ComponentName])
            : undefined;
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

    addTagToEntity(entity: Entity, tag: string) {
        const store = this.#components.get('Tags');
        const tagData = store?.get(entity) as EngineComponentSchema['Tags'];

        if (tagData) {
            tagData.list.add(tag);
        }
    }

    entityHasTag(entity: Entity, tag: string) {
        const tagData = this.getEntityComponentData(entity, 'Tags');
        return tagData?.list.has(tag) ?? false;
    }

    getEntityByPrettyId(id: string) {
        return this.#prettyIdMap.get(id)
    }

    getReadonlyFacade() {
        return {
            entityHasTag: this.entityHasTag.bind(this),
            entityHasComponent: this.entityHasComponent.bind(this),
            getEntitiesByComponents: this.getEntitiesByComponents.bind(this),
            getComponentsOnEntity: this.getComponentsOnEntity.bind(this),
            getEntityComponentData: this.getEntityComponentData.bind(this),
        }
    }
}
