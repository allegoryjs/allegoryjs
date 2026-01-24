export default class ECS {
    #nextEntityId= 1

    #stores = new Map<string, Map<number, Record<string, unknown>>>()

    defineComponent(name: string) {
        if (this.#stores.has(name)) {
            throw new Error(`Component named ${name} already exists`)
        }

        this.#stores.set(name, new Map());

        return name;
    }
    createEntity() {
        return this.#nextEntityId++;
    }

    addComponentToEntity(
        entity: number,
        componentType: string,
        data: Record<string, unknown>
    ) {
        const store = this.#stores.get(componentType);

        if (!store) {
            throw new Error(`Unknown component type: ${componentType}`);
        }

        store.set(entity, data);
    }

    removeComponentFromEntity(entity: number, componentType: string) {
        this.#stores.get(componentType)?.delete(entity);
    }

    getComponentData(entity: number, componentType: string) {
        const store = this.#stores.get(componentType);

        return store?.get(entity);
    }

    entityHasComponent(entity: number, componentType: string) {
        const store = this.#stores.get(componentType);
        return !!store?.has(entity);
    }
}
