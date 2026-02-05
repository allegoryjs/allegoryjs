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
    ecsUtils: ReturnType<InstanceType<typeof ECS>["getReadonlyFacade"]>

    // the list of auxiliaries (implements, tools, etc.) that the user
    // issued the command with, sorted in the order that produces
    // the highest specificity for the given Law (tie goes to user order)
    auxiliary?: Entity[]

    // the list of auxiliaries as they originally appeared in the
    // user's command, in case the Law cares about the actual order
    originalAuxiliaries?: Entity[]
}

export enum LawMutationOpType {
    update = 'UPDATE',
    set = 'SET',
    add = 'ADD',
    remove = 'REMOVE',
    destroy = 'DESTROY',
}

export type MutationOp<ComponentSchema extends EngineComponentSchema> =
    | { op: LawMutationOpType.update,  entity: number, component: keyof ComponentSchema, value: object } // Merges data
    | { op: LawMutationOpType.set,     entity: number, component: keyof ComponentSchema, value: object } // Replaces data completely
    | { op: LawMutationOpType.add,     entity: number, component: keyof ComponentSchema, value: object }
    | { op: LawMutationOpType.remove,  entity: number, component: keyof ComponentSchema }
    | { op: LawMutationOpType.destroy, entity: number }

interface Contribution<ComponentSchema extends EngineComponentSchema> {
    status: ContributionStatus
    mutations?: Array<MutationOp<ComponentSchema>>
    narrations?: Array<string>
    events?: Array<EngineEvent>
}
// expresses the criteria which constitute a scenario the Law is concerned with
// e.g. if the entity has component ToolComponent and ToolComponent.type === 'wrench'
interface LawConcern<ComponentSchema extends EngineComponentSchema> {
    components?: Array<keyof ComponentSchema>
    props?: Array<{
        prop: string // strings must be in the format of ComponentName.propName or they are ignored
        value: string | number | boolean // the value that counts as a match
    }>
    tags?: Array<string>
    ids?: Array<string>
}

interface LawBid<ComponentSchema extends EngineComponentSchema> {
    law: Law<ComponentSchema>;
    score: number;
    reorderedAuxiliaries?: Entity[]; // The data we want to save!
}

// a matcher represents a scenario that a Law cares about
// e.g. the actor is the player, the target is an NPC, and the aux is a sword
// the specificity of each concern in the matcher is added together,
// then whatever matcher has the highest total specificity is treated
// as the Law's specificity for a given Intent
interface LawMatcher<ComponentSchema extends EngineComponentSchema> {
    actor?: LawConcern<ComponentSchema>
    target?: LawConcern<ComponentSchema>

    // the criteria for matching auxiliary entities.
    // for most games, these are implements or tools,
    // e.g. "fix car with wrench and spark plug" ->
    //      the 'auxiliary' field will contain something like
    //      [{ tags: ['wrench']}, { tags: ['sparkplug'] }]
    //      (and perhaps some component criteria too, like ToolComponent, etc)
    auxiliary?: Array<LawConcern<ComponentSchema>>
}

interface Law<ComponentSchema extends EngineComponentSchema> {
    layer: LawLayer
    name: string
    intents: Array<string> // an array of the intent names that the Law cares about
    apply: (ctx: LawContext) => Promise<Contribution<ComponentSchema>>

    /*
    the scenarios that the Law cares about. Given a player Intent,
    the matcher which scores highest on specificity is considered
    to be the Law's specificity score for that Intent.
    for example, say there is a Law called AssaultMagicLaw
    which handles the casting of attack magic and this Law cares
    about two scenarios:
    - the actor entity has tag Magician
    - the actor entity has ID sorcerer-king
    and there is also a Law called MagicSuppressionLaw
    which declares that a field suppresses the spells of any actor
    with tag Magician and tag Vulnerable. If a normal magician
    who is vulnerable tries to cast a spell, they should be silenced,
    i.e. MagicSuppressionLaw should win the bid.
    But if the Sorcerer King, who is immune to silencing, casts a spell,
    AssaultMagicLaw should win the bid. So each matcher represents
    a use case for the given law
    */
    matchers: Array<LawMatcher<ComponentSchema>>
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
        return Array.from(this.#laws.values())
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

            if (!this.#ecs.isComponent(componentName)) {
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
    #calculateBid(law: Law<ComponentSchema>, intent: Intent): LawBid<ComponentSchema> | null {
        const {
            name,
            actor,
            target,
            auxiliary
        } = intent

        if (!law.intents.includes(name)) {
            return null
        }

        let highestScoringBid: LawBid<ComponentSchema> | null = null

        law.matchers.forEach(({
            actor: actorConcern,
            target: targetConcern,
            auxiliary: auxConcerns
        }) => {
            const actorScore = actor && actorConcern ? this.#calculateConcernSpecificity(actor, actorConcern) : 0
            const targetScore = target && targetConcern ? this.#calculateConcernSpecificity(target, targetConcern) : 0

            // to find the correct score for auxiliary entities, we need to look at all
            // permutations of aux entity order, and compare each of their scores, and
            // set the total matcher aux score to whichever is highest.
            // this is to account for the scenario where the player enters something like,
            // "fix the car with the wrench, dielectric grease, and spark plug"
            // so the aux entity order is wrench, grease, spark plug,
            // but perhaps the MechanicLaw declared its aux concerns like spark plug, wrench, grease
            // in such a case, the matcher score would be inaccurate if we naively assumed
            // that the player always inputs in the "right" order.
            // now, there is a scenario where the order does actually matter, like placing
            // cursed items onto an altar in a specific order for a ritual; if the player gets it
            // wrong, they die. this is why, though the score is calculated off of the highest match,
            // the Law is invoked with the original ordering alongside the reordered list in the ctx
            let highestScoreAuxPermutation = auxiliary
            const auxiliaryScore = !(auxConcerns?.length && auxiliary?.length) ? 0 : (() => {
                type PermutationIndex = number
                type Score = number
                const scoreMap = new Map<PermutationIndex, Score>()
                let permutations: Array<Array<Entity>> = [[]]

                for (let entityId of auxiliary) {
                    const temp: Array<Array<Entity>> = []

                    for (let permutation of permutations) {
                        for (let index = 0; index <= permutation.length; index++) {
                            const newPermutation = [...permutation]
                            newPermutation.splice(index, 0, entityId)
                            temp.push(newPermutation)
                        }
                    }
                    permutations = temp
                }

                permutations.forEach((permutation, permutationIndex) => {
                    let permutationScore = 0

                    for (const [concernIndex, auxConcern] of auxConcerns.entries()) {
                        if (permutation[concernIndex]) {
                            permutationScore += this.#calculateConcernSpecificity(permutation[concernIndex], auxConcern)
                        }
                    }

                    scoreMap.set(permutationIndex, permutationScore)
                })

                let highScore = 0
                let highestScoringPermutationIndex: number = 0
                scoreMap.entries().forEach(([permutationIndex, score]) => {
                    if (score > highScore) {
                        highScore = score
                        highestScoringPermutationIndex = permutationIndex
                    }
                })

                highestScoreAuxPermutation = permutations[highestScoringPermutationIndex]
                return highScore
            })()

            if ([actorScore, targetScore, auxiliaryScore].some(score => score < 0)) {
                return
            }

            const totalScore = actorScore + targetScore + auxiliaryScore

            if (!highestScoringBid || totalScore > highestScoringBid.score) {
                highestScoringBid = {
                    law,
                    score: totalScore,
                    reorderedAuxiliaries: highestScoreAuxPermutation
                }
            }
        })

        return highestScoringBid
    }

    async #auctionIntent(intent: Intent): Promise<Array<Contribution<ComponentSchema>>> {
        // the list of all valid bids sorted in descending order of score
        const bids = this.#lawList
            .filter(law => law.intents.includes(intent.name))
            .flatMap(law => {
                const bid = this.#calculateBid(law, intent)

                return bid ? [bid] : []
            }).sort((bidA, bidB) => {
                const layerDiff = bidB.law.layer - bidA.law.layer
                if (layerDiff !== 0) {
                    return layerDiff
                }
                return bidB.score - bidA.score;
            })

        const contributions: Array<Contribution<ComponentSchema>> = []

        for (const bid of bids) {
            const { law, reorderedAuxiliaries } = bid
            const lawCtx: LawContext = {
                actor: intent.actor,
                target: intent.target,
                auxiliary: reorderedAuxiliaries,
                originalAuxiliaries: intent.auxiliary,
                ecsUtils: this.#ecs.getReadonlyFacade(),
            }

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
