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
import { DefaultLogger, type Logger } from './logger'



export default class IntentPipeline<
    ComponentSchema extends EngineComponentSchema = EngineComponentSchema
> {
    #emitter: Emitter
    #config: IntentPipelineConfig
    #intentClassificationModule: IntentClassificationModule
    #t: (slug: string) => string
    #laws: Map<string, Law<ComponentSchema>>
    #ecs: ECS<ComponentSchema>
    #logger: Logger

    constructor(
        emitter: Emitter,
        ecs: ECS<ComponentSchema>,
        intentClassificationModule: IntentClassificationModule,
        localizationModule: LocalizationModule,
        config: IntentPipelineConfig,
        logger?: Logger,
    ) {
        this.#emitter = emitter
        this.#ecs = ecs
        this.#config = config
        this.#t = localizationModule.$t
        this.#intentClassificationModule = intentClassificationModule
        this.#laws = new Map()
        this.#logger = logger ?? new DefaultLogger()
    }

    get #lawList() {
        return Array.from(this.#laws.values())
    }

    async #handleUnknownCommand() {
        this.#logger.debug('issued command is unknown; emitting unknown command narration event')
        await this.#emitter.emit(defaultEmitStreams.narrate, [
            this.#t('engine.unknown_command')
        ])
    }

    #calculateConcernSpecificity(
        entity: Entity,
        concern: LawConcern<ComponentSchema>,
    ) {
        this.#logger.debug(`Calculating concern specificity for entity ${entity} and concern ${JSON.stringify(concern)}`)

        const idScore = concern?.ids?.reduce((acc: number, id: number | string) => {
            let entityMatches: boolean
            if (typeof id === 'string') {
                // it's a pretty ID
                entityMatches = this.#ecs.getEntityByPrettyId(id) === entity
            } else {
                // it's a raw ECS ID
                entityMatches = this.#ecs.entityExists(id) && id === entity
            }

            return entityMatches ?
                acc + this.#config.biddingIdMatchPrice :
                acc
        }, 0) ?? 0

        this.#logger.debug(`Concern has an ID score of ${idScore}`)

        if (concern.ids && idScore === 0) {
            this.#logger.debug(`Entity ${entity} does not have any of the concern's listed IDs; returning -1 for specificity`)
            return -1
        }

        const componentScore = concern?.components?.reduce((acc, component) => {
                const entityHasComponent = this.#ecs.entityHasComponent(entity, component)
                if (entityHasComponent) {
                    this.#logger.debug(`Entity ${entity} has component ${component}; incrementing concern component score by ${this.#config.biddingComponentMatchPrice}`)
                    return acc + this.#config.biddingComponentMatchPrice
                }

                return acc
        }, 0) ?? 0

        this.#logger.debug(`Concern has a total component specificity score of ${componentScore}`)

        if (concern?.components?.length && componentScore === 0) {
            this.#logger.debug(`Entity ${entity} does not match any of the concern's listed components; returning -1 for specificity`)
            return -1
        }

        const propsScore = concern?.props?.reduce((acc, {
            prop,
            value
        }) => {
            this.#logger.debug(`Checking concern prop score for prop ${prop} against value ${value}`)
            const [componentName = '', property = ''] = prop.split('.')

            if (![componentName, property].every(str => !!str)) {
                const err = 'Invalid property matcher. Property matchers must be in the format of "ComponentName.propName"'
                this.#logger.error(err)
                throw new Error(err)
            }

            if (!this.#ecs.isComponent(componentName)) {
                const err = `Property matchers must be valid components (received ${componentName})`
                this.#logger.error(err)
                throw new Error(err)
            }

            const componentData = this.#ecs.getEntityComponentData(entity, componentName)

            if (
                !componentData ||
                !(property in componentData) ||
                componentData[property as keyof typeof componentData] !== value
            ) {
                this.#logger.debug(`No prop match for entity ${entity} for ${prop} with value ${value}`)
                return acc
            }

            this.#logger.debug(`Entity ${entity} matches prop ${prop} with value ${value}; adding ${this.#config.biddingPropsMatchPrice} to concern prop score accumulator`)
            return acc + this.#config.biddingPropsMatchPrice
        }, 0) ?? 0

        if (concern?.props?.length && propsScore === 0) {
            return -1
        }

        const tagsScore = concern?.tags?.reduce((acc, tag) => {
            this.#logger.debug(`Checking concern for match with tag ${tag}`)

            if (this.#ecs.entityHasTag(entity, tag)) {
                this.#logger.debug(`Entity ${entity} has tag ${tag}; adding ${this.#config.biddingTagsMatchPrice} to concern tag score accumulator`)
                return acc + this.#config.biddingTagsMatchPrice
            }
            return acc
        }, 0) ?? 0

        if (concern?.tags?.length && tagsScore === 0) {
            this.#logger.debug(`Entity ${entity} does not have any of the listed tags; returning -1 for concern specificity score`)
            return -1
        }

        const totalScore = componentScore +
            propsScore +
            tagsScore +
            idScore

        this.#logger.debug(`Total concern specificity: ${totalScore}`)

        return totalScore
    }

    // returns the specificity of the highest scoring matched scenario
    #calculateBid(law: Law<ComponentSchema>, intent: Intent): LawBid<ComponentSchema> | null {
        const {
            name,
            actor,
            target,
            auxiliary
        } = intent

        this.#logger.info(`Calculating bid for Law ${law.name} for intent ${name}`)
        this.#logger.debug(`Intent name: ${name}, actor: ${actor}, target: ${target}, auxiliary(s): ${auxiliary?.join(', ')}`)

        if (!law.intents.includes(name)) {
            this.#logger.debug(`Law ${law.name} does not handle intents of type ${name}`)
            return null
        }

        let highestScoringBid: LawBid<ComponentSchema> | null = null

        law.matchers.forEach(({
            actor: actorConcern,
            target: targetConcern,
            auxiliary: auxConcerns
        }, index) => {
            this.#logger.debug(`Checking matcher ${index} for Law ${law.name}`)

            const actorScore = actor && actorConcern ? this.#calculateConcernSpecificity(actor, actorConcern) : 0
            this.#logger.debug(`Actor score: ${actorScore}`)

            const targetScore = target && targetConcern ? this.#calculateConcernSpecificity(target, targetConcern) : 0
            this.#logger.debug(`Target score: ${targetScore}`)


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
                this.#logger.debug('Calculating auxiliary score for law matcher')
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

                this.#logger.debug(`All aux permutations: ${
                    permutations.map((permutation => {
                        return permutation.join(', ')
                    })).join('\n')
                }`)

                permutations.forEach((permutation, permutationIndex) => {
                    let permutationScore = 0

                    for (const [concernIndex, auxConcern] of auxConcerns.entries()) {
                        if (permutation[concernIndex]) {
                            permutationScore += this.#calculateConcernSpecificity(permutation[concernIndex], auxConcern)
                        }
                    }

                    this.#logger.debug(`Permutation ${permutationIndex} (${permutation.join(', ')}) has a total score of ${permutationScore}`)

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

                this.#logger.debug(`Highest scoring permutation: ${highestScoreAuxPermutation?.join(', ') ?? 'undefined'} with a score of ${highScore}`)

                return highScore
            })()

            if ([actorScore, targetScore, auxiliaryScore].some(score => score < 0)) {
                this.#logger.debug('No match for current matcher')
                return
            }

            const totalScore = actorScore + targetScore + auxiliaryScore
            this.#logger.debug(`Score for current matcher: ${totalScore}`)

            if (!highestScoringBid || totalScore > highestScoringBid.score) {
                highestScoringBid = {
                    law,
                    score: totalScore,
                    reorderedAuxiliaries: highestScoreAuxPermutation
                }
            }
        })

        this.#logger.info(`Bid for Law ${law.name} for intent ${name}: highestScoringBid`)
        return highestScoringBid
    }

    async #auctionIntent(intent: Intent, dryRun: boolean): Promise<Array<Contribution<ComponentSchema>>> {
        this.#logger.info(`Beginning auction for intent ${intent.name}; dry run = ${dryRun}`)
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

        this.#logger.debug(`Ordered bids (highest bid first): ${
            bids.map(bid => bid.law.name).join(', ')
        }`)

        const contributions: Array<Contribution<ComponentSchema>> = []

        for (const bid of bids) {
            const { law, reorderedAuxiliaries } = bid

            if (reorderedAuxiliaries && intent.auxiliary) {
                this.#logger.debug(`Auxiliary implements reordered. Old order:\n${
                    intent.auxiliary.join(', ')
                }\nNew order:\n${
                    reorderedAuxiliaries.join(', ')
                }`)
            }

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
                this.#logger.info('Intent rejected')
                return []
            }

            contributions.push(result)

            if (result.status === ContributionStatus.completed) {
                this.#logger.info('Intent completed; stopping Law execution loop')
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
        //      because entities aren't created until after all Laws put their mutation
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
                this.#logger.debug(`Adding future alias "${mutation.alias}"`)
                futureAliases.add(mutation.alias)
            } else if (mutation.op !== LawMutationOpType.create) {
                // if the entity identifier is a string, it is an alias
                if (typeof mutation.entity === 'string' && !futureAliases.has(mutation.entity)) {
                    const err = `Critical logic error: Law mutation operation referenced unknown alias '${mutation.entity}'. Mutations may have been declared out of order; an entity with an alias must be CREATE-ed before it is referenced by a mutation operation.`
                    this.#logger.error(err)
                    throw new Error(err)
                }
            }
        }
    }

    #applyMutation(mutation: MutationOp<ComponentSchema>, aliasMap: Map<string, Entity>) {
        if (mutation.op === LawMutationOpType.create) {
            const entityID = this.#ecs.createEntity(mutation.alias)
            this.#logger.debug(`New entity created: ${entityID}`)

            if (mutation.alias) {
                this.#logger.debug(`Setting alias ${mutation.alias} for new entity ${entityID}`)
                aliasMap.set(mutation.alias, entityID)
            }

            return
        }

        let entity: Entity

        // remember that entity ECS IDs are numbers;
        // aliases are strings which will be set as the Meta IDs of new entities when the mutation stack is executed
        if (typeof mutation.entity === 'string') {
            if (aliasMap.has(mutation.entity)) {
                entity = aliasMap.get(mutation.entity)!
            } else {
                const err = `Critical logic error: attempting to use nonexistent entity with alias ${mutation.entity}`
                this.#logger.error(err)
                throw new Error(err)
            }
        } else {
            entity = mutation.entity
        }

        if (typeof entity === 'undefined') {
            // the alias is checked for validity before we reach this step
            // so if this occurs, it is likely an engine bug
            const err = `Invalid alias ${mutation.entity} referenced in mutation op`

            this.#logger.error(err)
            throw new Error(err)
        }

        if (mutation.op === LawMutationOpType.remove) {
            this.#logger.debug(`Removing component ${mutation.component} from entity ${entity}`)

            this.#ecs.removeComponentFromEntity(entity, mutation.component)
            return
        }

        if (mutation.op === LawMutationOpType.destroy) {
            this.#logger.debug(`Destroying entity ${entity}`)

            this.#ecs.destroyEntity(entity)
            return
        }

        if (mutation.op === LawMutationOpType.set) {
            this.#logger.debug(`Setting component data for ${mutation.component} on entity ${entity}:\n${JSON.stringify(mutation.value)}`)

            this.#ecs.setComponentOnEntity(
                entity,
                mutation.component as keyof ComponentSchema & string,
                mutation.value,
            )
            return
        }

        if (mutation.op === LawMutationOpType.update) {
            this.#logger.debug(`Updating component data for ${mutation.component} on entity ${entity}:\n${JSON.stringify(mutation.value)}`)

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
            this.#logger.warn(`Intent ${intent.name} rejected`)
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

                this.#logger.debug(`${contribution?.mutations?.length} mutation contribution(s) added to stack`)

                mutations.push(...contribution.mutations)
            }

            if (contribution?.narrations?.length) {
                this.#logger.debug(`${contribution?.narrations?.length} narration contribution(s) added to stack`)

                narrations.push(...contribution.narrations)
            }

            if (contribution?.events?.length) {
                this.#logger.debug(`${contribution?.events?.length} event contribution(s) added to stack`)

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
            this.#logger.debug(`Emitting event of type ${event.type}`)

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
            this.#logger.debug('At least one intent extracted from the user\'s input is not valid')
            await this.#handleUnknownCommand()
            return
        }

        for (let index = 0; index < intentResponses.length; index++) {
            const intentResponse = intentResponses[index]

            if (!intentResponse?.intent) {
                const err = 'Intent response does not contain a valid intent'

                this.#logger.error(err)
                throw new Error(err)
            }

            const { intent, dryRun } = intentResponse

            try {
                await this.#handleIntent(intent, dryRun)
            } catch(e) {
                if (e instanceof Error && e.message === ERR_INTENT_REJECTED) {
                    this.#logger.warn('Intent rejected; stopping intent handling loop')
                    break
                } else {
                    throw e
                }
            }
        }
    }

    public ratifyLaw(newLaw: Law<ComponentSchema>) {
        if (this.#laws.has(newLaw.name)) {
            const err = `Error ratifying Law ${newLaw.name}; a Law with this name is already registered`

            this.#logger.error(err)
            throw new Error(err)
        }

        this.#logger.info(`Ratifying new law ${newLaw.name}`)
        this.#laws.set(newLaw.name, newLaw)
    }

    public repealLaw(name: string) {
        if (!this.#laws.has(name)) {
            const err = `Error repealing Law ${name}; no Law with this name is registered`

            this.#logger.error(err)
            throw new Error(err)
        }

        this.#logger.info(`Repealing Law ${name}`)
        this.#laws.delete(name)
    }
}
