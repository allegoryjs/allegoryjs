import type ECS from './ecs'
import type { EngineComponentSchema, Entity } from './ecs'
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
    // a law added some flavor and/or added some proposed mutations, but
    // isn't considering itself the final word; the Intent continues to propagate
    pass = 'PASS',

    // the Intent is determined to be impossible; roll back any queued changes and abort
    rejected = 'REJECTED',

    // the Intent has been fully handled; commit queued changes and stop propagation
    completed = 'COMPLETED'
}

interface IntentPipelineConfig {
    confidenceThreshold: 0.7
    biddingIdMatchPrice: 100
    biddingComponentMatchPrice: 10
    biddingPropsMatchPrice: 20
    biddingTagsMatchPrice: 2.5
}

interface Intent {
    name: string
    actor?: Entity
    target?: Entity

    // any tools or implements or other related entities
    auxiliary?: Array<Entity>
}

interface IntentClassificationResponse {
    intent?: Intent
    confidence: number
    valid: boolean
    dryRun: boolean
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
    | { op: 'DESTROY', entity: number }

interface Contribution {
    status: ContributionStatus
    mutations?: Array<MutationOp>
    narrations?: Array<string>
    events?: Array<EngineEvent>
}

interface LawConcern<ComponentSchema extends EngineComponentSchema> {
    components?: Array<keyof ComponentSchema>
    props?: Array<{
        prop: string // strings must be in the format of ComponentName.propName or they are ignored
        value: string | number | boolean // the value that counts as a match
    }>
    tags?: Array<string>
    ids?: Array<string>
}

interface LawMatcher<ComponentSchema extends EngineComponentSchema> {
    actor?: LawConcern<ComponentSchema>
    target?: LawConcern<ComponentSchema>
    auxiliary?: Array<LawConcern<ComponentSchema>>
}

interface Law<ComponentSchema extends EngineComponentSchema> {
    layer: LawLayer
    name: string
    intents: Array<string> // an array of the intent names that the Law cares about
    matchers: Array<LawMatcher<ComponentSchema>> // the scenarios that the Law cares about
    apply: (ctx: LawContext) => Contribution
}

interface IntentClassificationModule {
    getIntentFromCommand: (command: string) => Promise<Array<IntentClassificationResponse>>
}


export default class IntentPipeline<
    ComponentSchema extends EngineComponentSchema = EngineComponentSchema
> {
    #emitter: Emitter
    #config: IntentPipelineConfig
    #intentClassificationModule: IntentClassificationModule
    #t: (slug: string) => string
    #laws: Map<string, Law<ComponentSchema>>
    #ecs: ECS<ComponentSchema>

    constructor(
        emitter: Emitter,
        ecs: ECS<ComponentSchema>,
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

    // returns the specificity of the highest scoring matched scenario
    #calculateSpecificity(law: Law<ComponentSchema>, intent: Intent): number {
        const {
            name,
            actor,
            target,
            auxiliary
        } = intent

        if (!law.intents.includes(name)) {
            return 0
        }

        let highestScore = 0

        law.matchers.forEach(({
            actor: actorConcern,
            target: targetConcern,
            auxiliary: auxConcerns
        }) => {
            const actorComponentScore = actor ? actorConcern?.components?.reduce((acc, component) => {
                const entityHasComponent = this.#ecs.entityHasComponent(actor, component)
                if (entityHasComponent) {
                    return acc + this.#config.biddingComponentMatchPrice
                }

                return acc
            }, 0) ?? 0 : 0

            const actorPropsScore = actor ? actorConcern?.props?.reduce((acc, {
                prop,
                value
            }) => {
                const [componentName = '', property = ''] = prop.split('.')

                if (![componentName, property].every(str => !!str)) {
                    throw new Error('Invalid property matcher. Property matchers must be in the format of "ComponentName.propName"')
                }

                let actorHasComponent = false

                if (this.#ecs.isComponent(componentName)) {
                    actorHasComponent = this.#ecs.entityHasComponent(
                        actor,
                        componentName
                    )
                } else {
                    console.warn(`Property matchers must be valid components (received ${componentName})`);
                }

                if (!actorHasComponent) {
                    return acc
                }

                const componentData = this.#ecs.getEntityComponentData(actor, componentName)

                if (!componentData || componentData[property] !== value) {
                    return acc
                }
                // eztodo pick up here

                return acc + this.#config.biddingPropsMatchPrice
            }, 0) ?? 0 : 0
            const actorTagsScore
            const actorIdScore


        })
    }

    async #auctionIntent(intent: Intent): Array<Contribution> {
        // sort laws by specificity score
        // one by one, invoke law.apply
        //     if the status of the contribution is PASS, continue iterating
        //     if the status is COMPLETED, stop iteration and return contribution stack
        //     if the status is REJECTED, stop iteration and return an empty array

        const sortedLaws = this.#lawList.toSorted((lawA, lawB) => {
            const layerA = lawA.layer;
            const layerB = lawB.layer;

            if (layerA > layerB) {
                return -1
            } if (layerB > layerA) {
                return 1
            }

            const lawASpecificity = this.#calculateSpecificity(lawA, intent)
            const lawBSpecificity = this.#calculateSpecificity(lawB, intent)

            if (lawASpecificity > lawBSpecificity) {
                return -1
            }

            if (lawBSpecificity > lawASpecificity) {
                return 1
            }

            return 0
        })
    }

    ratifyLaw(newLaw: Law) {
        this.#laws.set(newLaw.name, newLaw)
    }

    revokeLaw(name: string) {
        this.#laws.delete(name)
    }

    async handleCommand(playerCommand: string) {
        const intentResponses = await this.#intentClassificationModule.getIntentFromCommand(playerCommand)

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
