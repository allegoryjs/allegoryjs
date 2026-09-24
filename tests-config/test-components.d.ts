import type { Entity } from '@/kernel/ecs/ecs.types'

declare global {
  interface AllegoryCustomComponentSchema {
    position: { x: number; y: number }
    velocity: { x: number; y: number }
    health: { current: number; max: number }
    stats: { strength: number; intelligence: number; dexterity: number }
    label: { text: string }
    nested: { a: { b: number } }
    cache: { data: string }
    name: { value: string }
    description: { value: string }
    inventory: { items: string[] }
    Item: { portable: boolean; weight: number }
    Container: { capacity: number; items: Entity[] }
    Flammable: { burned: boolean; temperature: number }
    Weapon: { damage: number; speed: number }
    Tool: { type: string }
    TestComponent: { value: number }
  }
}

// oxlint-disable-next-line unicorn/require-module-specifiers
export {}
