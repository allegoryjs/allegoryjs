import type EventBus from '@/helpers/event-bus/event-bus'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { EngineComponentSchema } from '@/kernel/ecs/ecs.types'
import type { SemanticResolutionSystem } from '@/kernel/ecs/systems/semantic-cache/semantic-cache.system'

export const ENTITY_GROUP_TARGET = 'TARGET'
export const ENTITY_GROUP_AUX = 'AUXILIARY'

// the standard classification used by the text classification pipeline which indicates
// the user entered text that doesn't map cleanly onto a known Intent
export const ACTION_NAME_UNKNOWN = 'UNKNOWN'

export interface IntentClassifierParams<ComponentSchema extends EngineComponentSchema> {
  config: IntentClassifierConfig
  eventBus: EventBus
  ecs: ECS<ComponentSchema>

  semanticResolutionSystem?: SemanticResolutionSystem<ComponentSchema>
  logger?: Logger
}

// the intermediate representation of objects in user commands coming
// from the NER-classification model
export interface NerResponseItem {
  entity_group: string
  word: string
  score: number // normalized from 0 - 1
}

export interface ClassifiedAction {
  action: string
  confidence: number // normalized from 0 - 1
}

export interface ClassifiedNerTarget {
  word: string
  confidence: number // normalized from 0 - 1
}

export interface ClassifiedNerImplement {
  word: string
  confidence: number // normalized from 0 - 1
}

export interface ClassifiedNer {
  targets: ClassifiedNerTarget[]
  auxiliaries: ClassifiedNerImplement[]
}

export interface IntentClassifierConfig {
  actionModelUrl: string
  actionModelConfidenceThreshold?: number // 0 - 1

  nerModelUrl: string
  nerModelConfidenceThreshold?: number // 0 - 1
}
