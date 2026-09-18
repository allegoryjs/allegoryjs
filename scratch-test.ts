type ComponentSchema = {
  health: { hp: number }
  position: { x: number; y: number }
}

type Entity = number

class ECS {
  getComponentsOnEntity(entity: Entity): Set<keyof ComponentSchema & string> {
    return new Set(['health'] as Array<keyof ComponentSchema & string>)
  }

  getEntityComponentData<K extends keyof ComponentSchema & string>(
    entity: Entity,
    name: K,
  ): ComponentSchema[K] {
    return {} as any
  }

  getAllEntityComponentData(
    entity: Entity,
  ): Partial<{ [K in keyof ComponentSchema & string]: Readonly<ComponentSchema[K]> }> {
    const data: Partial<{ [K in keyof ComponentSchema & string]: Readonly<ComponentSchema[K]> }> =
      {}

    const components = this.getComponentsOnEntity(entity)

    components.forEach((component) => {
      Object.assign(data, { [component]: this.getEntityComponentData(entity, component) })
    })

    return data
  }
}
