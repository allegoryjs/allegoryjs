import type { IntentClassificationResponse } from '@/kernel/intent-pipeline/intent-pipeline.types'

export const ENTITY_GROUP_TARGET = 'TARGET'
export const ENTITY_GROUP_AUX = 'AUXILIARY'

// the standard classification used by the text classification pipeline which indicates
// the user entered text that doesn't map cleanly onto a known Intent
export const ACTION_NAME_UNKNOWN = 'UNKNOWN'

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
