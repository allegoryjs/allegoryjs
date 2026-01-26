import type { Entity } from './ecs'
import Emitter, { defaultEmitStreams } from './emitter'
import type LocalizationModule from './localization'

enum LawLayer {
    /*********************
     *** Engine Layers ***
     *********************/
    // built-in laws, which typically handle basic functions (like saving) or
    // indicating that the engine does not understand a command,
    // and which are easily overwritten
    Core = 0,

    // laws packaged with the engine that the dev may choose to use;
    // readily relinquish control of Intents
    // e.g., "Take command moves item to inventory"
    StdLib = 1,


    /***********************
     *** Userland Layers ***
     ***********************/

    // laws related to the specific game being built
    // (and/or laws coming from a genre template)
    // e.g., "Taking a Cursed Item deals damage"
    Domain = 2,

    // laws related to a specific entity, attached via Script
    // e.g. e.g., "Taking the Idol triggers the boulder trap"
    Instance = 3
}

interface IntentPipelineConfig {
    confidenceThreshold: 0.7,

}

interface Intent {
    name: string
    actor: Entity
    target: Entity
}

interface IntentClassificationResponse {
    intent?: Intent
    confidence: number
    valid: boolean
    dryRun: boolean
}

interface MatchReport {
    layer: LawLayer;

    // The raw counts of what was matched
    // these figures combine the matches from both target and actor
    constraints: {
        ids: number;        // How many exact entity IDs matched?
        components: number; // How many components were checked for presence?
        props: number;      // How many component property values matched?
        tags: number;       // How many tags were checked?
    }
}

interface Law {
    name: string
    filter: (intent: Intent) => boolean // whether the Law cares about this kind of Intent
    getSpecificity: (intent: Intent) => MatchReport
}

interface IntentClassificationModule {
    convertCommandToIntents: (command: string) => Promise<Array<IntentClassificationResponse>>
}


export default class IntentPipeline {
    #emitter: Emitter
    #config: IntentPipelineConfig
    #intentClassificationModule: IntentClassificationModule
    #t: (slug: string) => string

    constructor(
        emitter: Emitter,
        intentClassificationModule: IntentClassificationModule,
        localizationModule: LocalizationModule,
        config: IntentPipelineConfig
    ) {
        this.#emitter = emitter
        this.#config = config
        this.#t = localizationModule.$t
        this.#intentClassificationModule = intentClassificationModule
    }

    async #handleUnknownCommand() {
        await this.#emitter.emit(defaultEmitStreams.narrate, [
            this.#t('engine.unknown_command')
        ])
    }

    #auction (intent: Intent): Promise<void> {
        return Promise.resolve();
    }

    ratifyLaw(newLaw: Law) {

    }

    revokeLaw(name: string) {

    }

    async handleCommand(playerCommand: string) {
        const intentResponses = await this.#intentClassificationModule.convertCommandToIntents(playerCommand)

        if (!intentResponses.length) {
            await this.#handleUnknownCommand();

            return
        }

        const allIntentsAreValid = intentResponses.every(
            response => response.confidence >= this.#config.confidenceThreshold && response.valid
        )

        if (!allIntentsAreValid) {
            console.info('At least one intent is invalid');
            await this.#handleUnknownCommand();
            return;
        }

        for (let index = 0; index < intentResponses.length; index++) {
            const intentResponse = intentResponses[index];

            if (!intentResponse || !intentResponse.intent) {
                console.warn('There was an issue accessing the intent response');
                await this.#handleUnknownCommand();
                return;
            }

            const { intent } = intentResponse;

        }
    }
}
