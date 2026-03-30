import type ECS from './ecs'
import type { EngineComponentSchema, Entity } from './ecs'
import Emitter, { defaultEmitStreams, type EngineEvent } from './emitter'
import {
    ContributionStatus,
    ERR_INTENT_REJECTED,
    LawMutationOpType,
 } from './intent-pipeline-types'

 import type {
    Contribution,
    Intent,
    IntentClassificationModule,
    IntentPipelineConfig,
    Law,
    LawBid,
    LawConcern,
    LawContext,
    MutationOp,
 } from './intent-pipeline-types'
import type LocalizationModule from './localization'



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

    async #auctionIntent(intent: Intent, dryRun: boolean): Promise<Array<Contribution<ComponentSchema>>> {
        // the list of all valid bids sorted in descending order of score
        const bids = this.#lawList
            .flatMap(law => {
                if (!law.intents.includes(intent.name)) {
                    return []
                }
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
                dryRun,
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

    #executeMutations(mutations: Array<MutationOp<ComponentSchema>>) {
        // aliases allows us to reference entities which don't exist yet
        // in mutation ops
        // e.g. let's say a Law wants to spawn a goblin, then insert him into
        //      an ongoing combat encounter. The Law won't have a reference for the
        //      goblin entity ID when it declares the second mutation operation,
        //      because entities aren't created until after all laws put their mutation
        //      requests on the stack. So the Law adds an UPDATE mutation op referencing the
        //      entity "goblin_05" *after* it adds a CREATE op with ID = "goblin_05".
        //      so this map resolves an alias to a real entity ID. Note that the alias
        //      given to the CREATE op becomes the entity's meta ID, so it must be unique
        const aliasMap = new Map<string, Entity>()

        for (const mutation of mutations) {
            this.#applyMutation(mutation, aliasMap)
        }
    }

    #validateMutations(
        mutations: Array<MutationOp<ComponentSchema>>
    ): void {
        const futureAliases = new Set<string>()

        for (const mutation of mutations) {
            if (mutation.op === LawMutationOpType.create && mutation.alias) {
                futureAliases.add(mutation.alias)
            } else if (mutation.op !== LawMutationOpType.create) {
                // if the entity identifier is a string, it is an alias
                if (typeof mutation.entity === 'string' && !futureAliases.has(mutation.entity)) {
                        throw new Error(`Critical logic error: Law mutation operation referenced unknown alias '${mutation.entity}'. Mutations may have been declared out of order; an entity with an alias must be CREATE-ed before it is referenced by a mutation operation.`)
                }
            }
        }
    }

    #applyMutation(mutation: MutationOp<ComponentSchema>, aliasMap: Map<string, Entity>) {
        if (mutation.op === LawMutationOpType.create) {
            const entityID = this.#ecs.createEntity(mutation.alias)
            if (mutation.alias) {
                aliasMap.set(mutation.alias, entityID)
            }
            return
        }

        // remember that entity ECS IDs are numbers;
        // aliases are strings which will be set as the Meta IDs of new entities when the mutation stack is executed
        const entity = typeof mutation.entity === 'string' ?
            aliasMap.get(mutation.entity) :
            mutation.entity

        if (typeof entity === 'undefined') {
            // the alias is checked for validity before we reach this step
            // so if this occurs, it is likely an engine bug
            throw new Error(`Invalid alias ${mutation.entity} referenced in mutation op`)
        }

        if (mutation.op === LawMutationOpType.remove) {
            this.#ecs.removeComponentFromEntity(entity, mutation.component)
            return
        }

        if (mutation.op === LawMutationOpType.destroy) {
            this.#ecs.destroyEntity(entity)
            return
        }

        if (mutation.op === LawMutationOpType.set) {
            this.#ecs.setComponentOnEntity(
                entity,
                mutation.component as keyof ComponentSchema & string,
                mutation.value,
            )
            return
        }

        if (mutation.op === LawMutationOpType.update) {
            this.#ecs.updateComponentData(
                entity,
                mutation.component as keyof ComponentSchema & string,
                mutation.value,
            )
            return
        }
    }

    async #handleIntent(intent: Intent, dryRun: boolean) {
        const contributionStack: Array<Contribution<ComponentSchema>> = []

        const tempContributions = await this.#auctionIntent(intent, dryRun)

        if (tempContributions.some(c => c.status === ContributionStatus.rejected)) {
            throw new Error(ERR_INTENT_REJECTED)
        }

        contributionStack.push(...tempContributions)

        const mutations: Array<MutationOp<ComponentSchema>> = []
        const narrations: Array<string> = []
        const events: Array<EngineEvent> = []

        for (const contribution of contributionStack) {
            if (contribution?.mutations?.length) {
                // throws if a mutation is invalid
                this.#validateMutations(contribution.mutations)

                mutations.push(...contribution.mutations)
            }

            if (contribution?.narrations?.length) {
                narrations.push(...contribution.narrations)
            }

            if (contribution?.events?.length) {
                events.push(...contribution.events)
            }
        }

        this.#executeMutations(mutations)

        for (const narration of narrations) {
            await this.#emitter.emit(defaultEmitStreams.narrate, [
                this.#t(narration)
            ])
        }

        for (const event of events) {
            await this.#emitter.emit(event.type, event.payload)
        }
    }



    public async handleCommand(playerCommand: string) {
        const intentResponses = await this.#intentClassificationModule.getIntentFromCommand(playerCommand)

        if (!intentResponses.length) {
            await this.#handleUnknownCommand()

            return
        }

        const allIntentsAreValid = intentResponses.every(
            ({ confidence, intent }) =>
                confidence >= this.#config.confidenceThreshold &&
                !!intent
        )

        if (!allIntentsAreValid) {
            console.debug('At least one intent extracted from the user\'s input is not valid')
            await this.#handleUnknownCommand()
            return
        }

        for (let index = 0; index < intentResponses.length; index++) {
            const intentResponse = intentResponses[index]

            if (!intentResponse?.intent) {
                throw new Error('Intent response does not contain a valid intent')
            }

            const { intent, dryRun } = intentResponse

            try {
                await this.#handleIntent(intent, dryRun)
            } catch(e) {
                if (e instanceof Error && e.message === ERR_INTENT_REJECTED) {
                    break
                } else {
                    throw e
                }
            }
        }
    }

    public ratifyLaw(newLaw: Law<ComponentSchema>) {
        this.#laws.set(newLaw.name, newLaw)
    }

    public revokeLaw(name: string) {
        this.#laws.delete(name)
    }
}
