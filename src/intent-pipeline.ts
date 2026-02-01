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
    auxiliary?: Entity[]
    ecsUtils: ReturnType<InstanceType<typeof ECS>["getReadonlyFacade"]>
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
    apply: (ctx: LawContext) => Promise<Contribution>
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

    #calculateConcernSpecificity(
        entity: Entity,
        concern: LawConcern<ComponentSchema>,
    ) {
        const idScore = concern?.ids?.reduce((acc, id) => {
            return this.#ecs.getEntityByPrettyId(id) === entity ?
                acc + this.#config.biddingIdMatchPrice :
                acc
        }, 0) ?? 0

        if (concern.ids && idScore === 0) {
            return -1
        }

        const componentScore = concern?.components?.reduce((acc, component) => {
                const entityHasComponent = this.#ecs.entityHasComponent(entity, component)
                if (entityHasComponent) {
                    return acc + this.#config.biddingComponentMatchPrice
                }

                return acc
        }, 0) ?? 0

        if (concern?.components?.length && componentScore === 0) {
            return -1
        }

        const propsScore = concern?.props?.reduce((acc, {
            prop,
            value
        }) => {
            const [componentName = '', property = ''] = prop.split('.')

            if (![componentName, property].every(str => !!str)) {
                console.warn('Invalid property matcher. Property matchers must be in the format of "ComponentName.propName"')
                return acc
            }

            let actorHasComponent = false

            if (this.#ecs.isComponent(componentName)) {
                actorHasComponent = this.#ecs.entityHasComponent(
                    entity,
                    componentName
                )
            } else {
                console.warn(`Property matchers must be valid components (received ${componentName})`)
                return acc
            }

            const componentData = this.#ecs.getEntityComponentData(entity, componentName)

            if (
                !componentData ||
                !(property in componentData) ||
                componentData[property as keyof typeof componentData] !== value
            ) {
                return acc
            }

            return acc + this.#config.biddingPropsMatchPrice
        }, 0) ?? 0

        if (concern?.props?.length && propsScore === 0) {
            return -1
        }

        const tagsScore = concern?.tags?.reduce((acc, tag) => {
            if (this.#ecs.entityHasTag(entity, tag)) {
                return acc + this.#config.biddingTagsMatchPrice
            }
            return acc
        }, 0) ?? 0

        if (concern?.tags?.length && tagsScore === 0) {
            return -1
        }

        return componentScore +
            propsScore +
            tagsScore +
            idScore
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
            return -1
        }

        let highestScore = 0

        law.matchers.forEach(({
            actor: actorConcern,
            target: targetConcern,
            auxiliary: auxConcerns
        }) => {
            const actorScore = actor && actorConcern ? this.#calculateConcernSpecificity(actor, actorConcern) : 0
            const targetScore = target && targetConcern ? this.#calculateConcernSpecificity(target, targetConcern) : 0
            const auxiliaryScore = auxConcerns ? (auxiliary?.reduce((acc, auxEntity, index) => {
                if (!auxConcerns[index]) {
                    return acc
                }
                // eztodo this assumes aux entities are ordered the same as aux concerns. this is an issue
                return acc + this.#calculateConcernSpecificity(auxEntity, auxConcerns[index])
            }, 0) ?? 0) : 0

            if ([actorScore, targetScore, auxiliaryScore].some(score => score < 0)) {
                return
            }

            const totalScore = actorScore + targetScore + auxiliaryScore

            if (totalScore > highestScore) {
                highestScore = totalScore
            }
        })

        return highestScore
    }

    async #auctionIntent(intent: Intent): Promise<Array<Contribution>> {
        const specificityCache = new Map<Law<ComponentSchema>, number>()

        const sortedLaws = this.#lawList.filter(law => law.intents.includes(intent.name)).toSorted((lawA, lawB) => {
            const layerA = lawA.layer;
            const layerB = lawB.layer;

            if (layerA > layerB) {
                return -1
            } if (layerB > layerA) {
                return 1
            }

            if (!specificityCache.has(lawA)) {
                specificityCache.set(lawA, this.#calculateSpecificity(lawA, intent))
            }

            if (!specificityCache.has(lawB)) {
                specificityCache.set(lawB, this.#calculateSpecificity(lawB, intent))
            }

            const lawASpecificity = specificityCache.get(lawA) ?? 0
            const lawBSpecificity = specificityCache.get(lawB) ?? 0

            if (lawASpecificity > lawBSpecificity) {
                return -1
            }

            if (lawBSpecificity > lawASpecificity) {
                return 1
            }

            return 0
        }).filter(law => specificityCache.get(law) !== -1)

        const contributions: Array<Contribution> = []
        const lawCtx: LawContext = {
            actor: intent.actor,
            target: intent.target,
            auxiliary: intent.auxiliary, // eztodo will i need to store specific relationships between aux entities, or just assume they are all stated like "open the vent with the crowbar and the screwdriver"
            ecsUtils: this.#ecs.getReadonlyFacade()
        }

        for (const law of sortedLaws) {
            const result = await law.apply(lawCtx)

            if (result.status === ContributionStatus.rejected) {
                return []
            }

            contributions.push(result)

            if (result.status === ContributionStatus.completed) {
                break
            }
        }

        return contributions
    }

    ratifyLaw(newLaw: Law<ComponentSchema>) {
        this.#laws.set(newLaw.name, newLaw)
    }

    revokeLaw(name: string) {
        this.#laws.delete(name)
    }

    async handleCommand(playerCommand: string) {
        const intentResponses = await this.#intentClassificationModule.getIntentFromCommand(playerCommand)

        if (!intentResponses.length) {
            await this.#handleUnknownCommand()

            return
        }

        const allIntentsAreValid = intentResponses.every(
            response => response.confidence >= this.#config.confidenceThreshold && response.valid
        )

        if (!allIntentsAreValid) {
            console.info('At least one intent is invalid')
            await this.#handleUnknownCommand()
            return
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

            const contributions = this.#auctionIntent(intent)


        }
    }
}
