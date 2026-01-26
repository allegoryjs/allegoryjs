import type ECS from './ecs'
import type { Entity } from './ecs'
import Emitter, { defaultEmitStreams, type EngineEvent } from './emitter'
import type LocalizationModule from './localization'

enum LawLayer {
    /*********************
     *** Engine Layers ***
     *********************/
    // built-in laws, which typically handle basic functions (like saving) or
    // indicating that the engine does not understand a command,
    // and which are easily overwritten. Typically returns a COMPLETED in the contribution
    Core = 0,

    // laws packaged with the engine that the dev may choose to use;
    // readily relinquish control of Intents. Often returns a COMPLETED in the contribution
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

enum ContributionStatus {
    pass = 'PASS',
    rejected = 'REJECTED',
    completed = 'COMPLETED'
}

interface IntentPipelineConfig {
    confidenceThreshold: 0.7
    biddingIdMatchPrice: 100
    biddingComponentMatchPrice: 10
    biddingPropsMatchPrice: 20
    biddingTagsMatchPrice: 2
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

interface SpecificityReport {
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

interface LawContext {
    actor?: Entity
    target?: Entity
    ecsUtils: {
        entityHasTag: () => {}
        entityHasComponent: () => {}
        getEntitiesByComponents: () => {}
        getComponentsOnEntity: () => {}
        getEntityComponentData: () => {}
    }
}

type MutationOp =
    | { op: 'UPDATE',  entity: number, component: string, value: object } // Merges data
    | { op: 'SET',     entity: number, component: string, value: object } // Replaces data completely
    | { op: 'ADD',     entity: number, component: string, value: object }
    | { op: 'REMOVE',  entity: number, component: string }
    | { op: 'DESTROY', entity: number };

interface Contribution {
    status: ContributionStatus
    mutations?: Array<MutationOp>
    narrations?: Array<string>
    events?: Array<EngineEvent>
}

interface LawConcern {
    components?: Array<string>
    props?: Array<{
        prop: string // strings must be in the format of ComponentName.propName or they are ignored
        value: string | number | boolean // the value that counts as a match
    }>
    tags?: Array<string>
    ids?: Array<string>
}

interface LawMatcher {
    actor?: LawConcern
    target?: LawConcern
}

interface Law {
    name: string
    intents: Array<string> // an array of the intent names that the Law cares about
    matchers: Array<LawMatcher> // the scenarios that the Law cares about
    apply: (ctx: LawContext) => Contribution
}

interface IntentClassificationModule {
    convertCommandToIntents: (command: string) => Promise<Array<IntentClassificationResponse>>
}


export default class IntentPipeline {
    #emitter: Emitter
    #config: IntentPipelineConfig
    #intentClassificationModule: IntentClassificationModule
    #t: (slug: string) => string
    #laws: Map<string, Law>
    #ecs: ECS

    constructor(
        emitter: Emitter,
        ecs: ECS,
        intentClassificationModule: IntentClassificationModule,
        localizationModule: LocalizationModule,
        config: IntentPipelineConfig
    ) {
        this.#emitter = emitter
        this.#ecs = ecs
        this.#config = config
        this.#t = localizationModule.$t
        this.#intentClassificationModule = intentClassificationModule
        this.#laws = new Map()
    }

    get #lawList() {
        return Array.from(this.#laws).map(([, law]) => law)
    }

    async #handleUnknownCommand() {
        await this.#emitter.emit(defaultEmitStreams.narrate, [
            this.#t('engine.unknown_command')
        ])
    }

    async #auctionIntent(intent: Intent): Array<Contribution> {
        const specificityCache = new Map<string, SpecificityReport>()
        const bidCache = new Map<string, number>()

        const sortedLaws = this.#lawList.toSorted((lawA, lawB) => {
            if (!specificityCache.has(lawA.name)) {
                specificityCache.set(lawA.name, lawA.getSpecificityReport(intent))
            }

            if (!specificityCache.has(lawB.name)) {
                specificityCache.set(lawB.name, lawB.getSpecificityReport(intent))
            }

            const lawALayer = specificityCache.get(lawA.name)!.layer
            const lawBLayer = specificityCache.get(lawB.name)!.layer

            if (lawALayer !== lawBLayer) {
                return  lawBLayer - lawALayer
            }

            let lawABid: number
            let lawBBid: number

            if (!bidCache.has(lawA.name)) {
                lawABid = this.calculateBid(specificityCache.get(lawA.name)!, intent)
            }
        })
    }

    calculateBid(specificityReport: SpecificityReport, intent: Intent): number {
        /*
            ids: number;        // How many exact entity IDs matched?
            components: number; // How many components were checked for presence?
            props: number;      // How many component property values matched?
            tags: number;       // How many tags were checked?
        */

        const idMatches = this.#ecs.
    }

    ratifyLaw(newLaw: Law) {
        this.#laws.set(newLaw.name, newLaw)
    }

    revokeLaw(name: string) {
        this.#laws.delete(name)
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

        let isDryRun = false

        for (let index = 0; index < intentResponses.length; index++) {
            const intentResponse = intentResponses[index];

            if (!intentResponse || !intentResponse.intent) {
                console.warn('There was an issue accessing the intent response');
                await this.#handleUnknownCommand();
                return;
            }

            const { intent, dryRun } = intentResponse;

            if (dryRun) {
                isDryRun = true
            }

            this.#auctionIntent(intent)


        }
    }
}
