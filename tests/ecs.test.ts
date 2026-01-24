import { describe, expect, test } from 'bun:test';
import ECS from "../src/ecs";

describe("ECS", () => {
  test("creates entities and queries by components", () => {
    const ecs = new ECS();
    const position = ecs.defineComponent('position');
    const velocity = ecs.defineComponent('velocity');

    const entityA = ecs.createEntity();
    const entityB = ecs.createEntity();

    ecs.addComponentToEntity(entityA, position, { x: 1, y: 2 });
    ecs.addComponentToEntity(entityA, velocity, { x: 0, y: 1 });
    ecs.addComponentToEntity(entityB, position, { x: 5, y: 6 });

    expect(ecs.getComponentData(entityA, position)).toEqual({ x: 1, y: 2 });
    expect(ecs.entityHasComponent(entityB, velocity)).toBe(false);
    expect(ecs.getEntitiesByComponents(position)).toEqual([entityA, entityB]);
    expect(ecs.getEntitiesByComponents(position, velocity)).toEqual([entityA]);

    ecs.removeComponentFromEntity(entityA, velocity);
    expect(ecs.getEntitiesByComponents(position, velocity)).toEqual([]);

    ecs.destroyEntity(entityB);
    expect(ecs.getEntitiesByComponents(position)).toEqual([entityA]);
  });
});
