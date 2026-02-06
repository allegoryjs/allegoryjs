import { describe, expect, test } from 'bun:test';
import ECS, { type EngineComponentSchema } from "../src/ecs";

describe("ECS", () => {
  test("creates entities and queries by components", () => {
    const ecs = new ECS<{
      position: {
        x: number,
        y: number,
      },
      velocity: {
        x: number,
        y: number,
      }
    } & EngineComponentSchema>();
    const position = ecs.defineComponent('position');
    const velocity = ecs.defineComponent('velocity');

    const entityA = ecs.createEntity();
    const entityB = ecs.createEntity();

    ecs.setComponentOnEntity(entityA, position, { x: 1, y: 2 });
    ecs.setComponentOnEntity(entityA, velocity, { x: 0, y: 1 });
    ecs.setComponentOnEntity(entityB, position, { x: 5, y: 6 });

    expect(ecs.getEntityComponentData(entityA, position)).toEqual({ x: 1, y: 2 });
    expect(ecs.entityHasComponent(entityB, velocity)).toBe(false);
    expect(ecs.getEntitiesByComponents(position)).toEqual([entityA, entityB]);
    expect(ecs.getEntitiesByComponents(position, velocity)).toEqual([entityA]);

    ecs.removeComponentFromEntity(entityA, velocity);
    expect(ecs.getEntitiesByComponents(position, velocity)).toEqual([]);

    ecs.destroyEntity(entityB);
    expect(ecs.getEntitiesByComponents(position)).toEqual([entityA]);
  });

  test("setComponentOnEntity sets component data", () => {
    const ecs = new ECS<{
      health: {
        current: number,
        max: number,
      }
    } & EngineComponentSchema>();
    const health = ecs.defineComponent('health');
    const entity = ecs.createEntity();

    ecs.setComponentOnEntity(entity, health, { current: 100, max: 100 });
    expect(ecs.getEntityComponentData(entity, health)).toEqual({ current: 100, max: 100 });

    ecs.setComponentOnEntity(entity, health, { current: 50, max: 150 });
    expect(ecs.getEntityComponentData(entity, health)).toEqual({ current: 50, max: 150 });
  });

  test("setComponentOnEntity throws error for undefined component", () => {
    const ecs = new ECS<{
      position: { x: number, y: number }
    } & EngineComponentSchema>();
    const entity = ecs.createEntity();

    expect(() => {
      ecs.setComponentOnEntity(entity, 'undefinedComponent' as any, { x: 0, y: 0 });
    }).toThrow('Unknown component type: undefinedComponent');
  });

  test("updateComponentData merges component data", () => {
    const ecs = new ECS<{
      stats: {
        strength: number,
        intelligence: number,
        dexterity: number,
      }
    } & EngineComponentSchema>();
    const stats = ecs.defineComponent('stats');
    const entity = ecs.createEntity();

    ecs.setComponentOnEntity(entity, stats, { strength: 10, intelligence: 8, dexterity: 12 });

    ecs.updateComponentData(entity, stats, { strength: 15 });
    expect(ecs.getEntityComponentData(entity, stats)).toEqual({
      strength: 15,
      intelligence: 8,
      dexterity: 12
    });

    ecs.updateComponentData(entity, stats, { intelligence: 10, dexterity: 14 });
    expect(ecs.getEntityComponentData(entity, stats)).toEqual({
      strength: 15,
      intelligence: 10,
      dexterity: 14
    });
  });

  test("updateComponentData throws error for undefined component", () => {
    const ecs = new ECS<{
      position: { x: number, y: number }
    } & EngineComponentSchema>();
    const entity = ecs.createEntity();

    expect(() => {
      ecs.updateComponentData(entity, 'undefinedComponent' as any, { x: 0 });
    }).toThrow('Unknown component type: undefinedComponent');
  });
});
