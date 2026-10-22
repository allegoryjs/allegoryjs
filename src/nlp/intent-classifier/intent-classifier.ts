import type {
  TextClassificationPipeline,
  TokenClassificationPipeline,
} from '@huggingface/transformers'

import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import { SYSTEM_SCHEMA_COMPONENTS, type Entity } from '@/kernel/ecs/ecs.types'
import type { Intent } from '@/kernel/intent-pipeline/intent-pipeline.types'
import {
  ENTITY_GROUP_AUX,
  ENTITY_GROUP_TARGET,
  type ClassifiedAction,
  type ClassifiedNer,
  type ClassifiedNerTarget,
  type IntentClassifierConfig,
} from '@/nlp/intent-classifier/intent-classifier.types'
import type { IntentClassifierParams } from '@/nlp/intent-classifier/intent-classifier.types'
import { splitRawCommands } from '@/nlp/language-profile/en-us/profile-en-us'
import type { SemanticCacheData } from '@/kernel/ecs/systems/semantic-cache/semantic-cache.types'

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8
const thresholdIsValid = (threshold: number | undefined) =>
  typeof threshold === 'number' && threshold >= 0 && threshold <= 1

/**
 * @class IntentClassifier
 *
 * Responsible for coordinating the transformation of a raw player input into
 * a list of actionable Intents that the engine knows how to handle
 */
export class IntentClassifier {
  #logger: Logger
  #initialized = false
  #config: IntentClassifierConfig
  #actionPipeline?: TextClassificationPipeline
  #nerPipeline?: TokenClassificationPipeline
  #ecs: ECS
  #phraseEmbeddingsCache: Map<string, Float32Array> = new Map()

  constructor({
    config,
    logger,
    ecs,
  }: IntentClassifierParams) {
    this.#logger = logger ?? new DefaultLogger()

    const thresholdProperties = [
      'actionModelConfidenceThreshold',
      'nerModelConfidenceThreshold',
    ] as const
    thresholdProperties.forEach((name) => {
      const cfgValue = config[name]

      if (!thresholdIsValid(cfgValue)) {
        const error = `Error creating IntentClassifier: config.${name} must be a number between 0 and 1 (inclusive); received ${cfgValue}`
        this.#logger.errorAndThrow(error)
      }
    })

    this.#config = {
      actionModelConfidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      nerModelConfidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      ...config,
    }

    this.#ecs = ecs
  }

  async initialize() {
    if (this.#initialized) {
      this.#logger.warn('Cannot initialize Intent Classifier: already initialized')
      return
    }

    const { pipeline, env } = await import('@huggingface/transformers')

    env.allowLocalModels = true
    env.allowRemoteModels = true

    this.#actionPipeline = await pipeline('text-classification', this.#config.actionModelUrl)
    this.#nerPipeline = await pipeline('token-classification', this.#config.nerModelUrl)

    this.#initialized = true
  }

  async getIntentsFromInput(command: string): Promise<Intent[]> {
    this.#assertReady()

    // eztodo splitRawCommands should be injected so different languages are usable; don't assume en-US
    const classifiedCommandsResults = await Promise.allSettled(
      splitRawCommands(command).map(async (splitCommand) => {
        // eztodo error handling
        const { targets, auxiliaries } = await this.#classifyNer(splitCommand.raw)

        return {
          dryRun: splitCommand.dryRun,
          action: await this.#classifyAction(splitCommand.raw),
          targets,
          auxiliaries,
        }
      })
    )

    if (classifiedCommandsResults.some(({ status }) => status === 'rejected')) {
      const rejectedReasons = classifiedCommandsResults.reduce((acc, result, index) => {
        if (result.status === 'fulfilled') {
          return acc
        }

        return acc + `Command of index ${index} failed with reason: ${result.reason}\n`
      }, '')

      this.#logger.errorAndThrow(`Error performing NER classification on command(s):\n${rejectedReasons}`)
    }

    const classifiedCommands = classifiedCommandsResults.flatMap((result) => {
      if (result.status === 'rejected') {
        return []
      }

      return [result.value]
    })


    // eztodo remove comment
    // now i have a list of commands which have actual engine action names, and plain-text, unresolved entity descriptors
    // so what i need to do is:
    //     1. get a set of entities which are salient
    //     2. get all semantic descriptors for each entity
    //     3. Per Intent: figure out based on the plain-text targets/auxiliaries which descriptors, if any, match
    //         - needs to be done for each target and each auxiliary
    //         - get cosine similarity of target/aux and each descriptor (first whole descriptor, then for each chunk)
    //         - for each target/aux plain-text, save the entity with the highest similarity score + the score
    //             - what to do if some entities tie in cosine similarity score?
    //     4. save the entity IDs in the returned Intent object as the target(s) and aux(s)
    //     5. return intents

    const salientEntities = this.#ecs.getEntitiesByComponents(SYSTEM_SCHEMA_COMPONENTS.salienceCache)
    const semanticDescriptors = new Map<Entity, SemanticCacheData>()

    for (const entity of salientEntities) {
      const salienceCache = this.#ecs.getEntityComponentData(entity, SYSTEM_SCHEMA_COMPONENTS.salienceCache)!

      if (salienceCache.salience === 0) {
        salientEntities.delete(entity)
        continue
      }

      const semanticDescriptor = this.#ecs.getEntityComponentData(entity, SYSTEM_SCHEMA_COMPONENTS.semanticCache)

      if (!semanticDescriptor) {
        this.#logger.errorAndThrow(`Failed to resolve semantic descriptor for entity ${entity}; if you did not modify the default system components, this is likely an internal engine bug.`)
      }

      semanticDescriptors.set(entity, semanticDescriptor)
    }

    for (const classifiedCommand of classifiedCommands) {
      const resolvedTargets: Entity[] = []
      const resolvedAux: Entity[] = []

      for (const target of classifiedCommand.targets) {
        const embedding = this.#phraseEmbeddingsCache.getOrInsertComputed(target.word, () => this.#vectorize(target.word))
      }

      for (const aux of classifiedCommand.auxiliaries) {

      }
    }
  }

  #assertReady() {
    const ready = this.#initialized && !!this.#nerPipeline && !!this.#actionPipeline

    if (!ready) {
      this.#logger.errorAndThrow('Cannot get intents from input: Intent Classifier not initialized')
    }
  }

  async #classifyAction(command: string): Promise<ClassifiedAction> {
    this.#assertReady()

    const classifier = await this.#actionPipeline!(command, { top_k: 1 })
    const { label, score } = classifier[0]! // the pipeline is configured to always output 1 result (`top_k: 1` above)

    return {
      action: label,
      confidence: score,
    }
  }

  async #classifyNer(command: string): Promise<ClassifiedNer> {
    this.#assertReady()

    const tokens = await this.#nerPipeline!(command, { aggregation_strategy: 'simple' })

    const targets: ClassifiedNerTarget[] = []
    const auxiliaries: ClassifiedNerTarget[] = []

    tokens.forEach((token) => {
      const payload = {
        word: token.word,
        confidence: token.score,
      }

      if (token.entity_group === ENTITY_GROUP_TARGET) {
        targets.push(payload)
      } else if (token.entity_group === ENTITY_GROUP_AUX) {
        auxiliaries.push(payload)
      }
    })

    return {
      targets,
      auxiliaries,
    }
  }

  #vectorize(word: string) {
    // eztodo
    return new Float32Array()
  }

  async #matchEntities(subject: string): Promise<Set<Entity>> {
    this.#assertReady()
  }
}
