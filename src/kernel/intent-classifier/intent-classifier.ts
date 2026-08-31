import { splitRawCommands } from '@/nlp/language-profile/profiles/profile-en-us'

import type { Intent } from '@/kernel/intent-pipeline/intent-pipeline.types'
import { ENTITY_GROUP_AUX, ENTITY_GROUP_TARGET, type ClassifiedAction, type ClassifiedNer, type ClassifiedNerTarget, type IntentClassifierConfig } from '@/kernel/intent-classifier/intent-classifier.types'
import type { TextClassificationPipeline, TokenClassificationPipeline } from '@huggingface/transformers'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8
const thresholdIsValid = (threshold: number | undefined) => typeof threshold === 'number' && threshold >= 0 && threshold <= 1

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
    #actionPipeline: TextClassificationPipeline
    #nerPipeline: TokenClassificationPipeline

    constructor(config: IntentClassifierConfig, logger?: DefaultLogger) {
        this.#logger = logger ?? new DefaultLogger()

        const thresholdProperties = ['actionModelConfidenceThreshold', 'nerModelConfidenceThreshold'] as const
        thresholdProperties.forEach((name) => {
            const cfgValue = config[name]
            const error = `Error creating IntentClassifier: config.${name} must be a number between 0 and 1 (inclusive); received ${cfgValue}`

            if (!thresholdIsValid(cfgValue)) {
                this.#logger.error(error)
                throw new Error()
            }
        })

        this.#config = {
            actionModelConfidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
            nerModelConfidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
            ...config
        }
    }

    async initialize() {
        if (this.#initialized) {
            this.#logger.warn('Cannot initialize Intent Classifier: already initialized')
            return
        }

        const { pipeline, env } = await import('@huggingface/transformers');

        env.allowLocalModels = true
        env.allowRemoteModels = true

        // eztodo err handling
        this.#actionPipeline = await pipeline('text-classification', this.#config.actionModelUrl)
        this.#nerPipeline = await pipeline('token-classification', this.#config.nerModelUrl)

        this.#initialized = true
    }

    async getIntentsFromInput(command: string): Promise<Intent[]> {
        // eztodo splitRawCommands should be injected so different languages are usable; don't assume en-US
        const classifiedCommands = splitRawCommands(command).map(async (splitCommand) => {
            // eztodo error handling
            const { targets, auxiliaries} = await this.#classifyNer(splitCommand.raw)

            return {
                dryRun: splitCommand.dryRun,
                action: await this.#classifyAction(splitCommand.raw),
                targets,
                auxiliaries
            }
        })
    }

    async #classifyAction(command: string): Promise<ClassifiedAction> {
        const classifier = await this.#actionPipeline(command, { top_k: 1 })
        const { label, score } = classifier[0]! // the pipeline is configured to always output 1 result (`top_k: 1` above)

        return {
            action: label,
            confidence: score
        }
    }

    async #classifyNer(command: string): Promise<ClassifiedNer> {
        // eztodo err handling
        const tokens = await this.#nerPipeline(
            command,
            { aggregation_strategy: 'simple' }
        );

        const targets: ClassifiedNerTarget[] = []
        const auxiliaries: ClassifiedNerTarget[] = []

        tokens.forEach((token) => {
            const payload = {
                word: token.word,
                confidence: token.score
            }

            if (token.entity_group === ENTITY_GROUP_TARGET) {
                targets.push(payload)
            } else if (token.entity_group === ENTITY_GROUP_AUX) {
                auxiliaries.push(payload)
            }
        })

        return {
            targets,
            auxiliaries
        }
    }

    async #matchEntities() {

    }
}
