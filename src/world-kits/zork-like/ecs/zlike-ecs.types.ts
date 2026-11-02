import { SYSTEM_SCHEMA_COMPONENTS, type Entity } from '@/kernel/ecs/ecs.types'
import type { SalienceCacheData } from '@/world-kits/zork-like/ecs/systems/salience/salience.types'
import type { SemanticCacheData } from '@/world-kits/zork-like/ecs/systems/semantic-cache/semantic-cache.types'

export type Noun = string

declare global {
  interface AllegoryCustomComponentSchema {
    Noun: {
      noun: Noun
    }

    SemanticCache: SemanticCacheData

    SalienceCache: SalienceCacheData
  }
}

export const ZLIKE_SYSTEM_COMPONENTS = {
  ...SYSTEM_SCHEMA_COMPONENTS,
  noun: 'Noun',
  semanticCache: 'SemanticCache',
  salienceCache: 'SalienceCache',
} as const

export interface ZLikeECS {
  createEntity(metaId?: string, noun?: Noun): Entity
}
