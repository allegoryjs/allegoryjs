import type ECS from './ecs'
import type { EngineComponentSchema, Entity } from './ecs'
import type { EngineEvent } from './emitter'

export enum LawLayer {
    /*********************
     *** Engine Layers ***
     *********************/
    // built-in Laws, which typically handle basic functions (like saving) or
    // indicating that the engine does not understand a command,
    // and which are easily overwritten. Typically returns a COMPLETED in the contribution
    Core = 0,

    // Laws coming from world kits, providing the generic functionality which is
    // likely to be used by games in a given genre
    // e.g. for a game using the adventure game world kit, this would include
    //.     things like movement, perception, combat, and inventory
    Kit = 1,

    /***********************
     *** Userland Layers ***
     ***********************/


    // Laws related to the specific game being built. The default layer for new Laws created by game devs.
    // e.g. "Taking a Cursed Item deals damage"
    Game = 2,

    // Laws related to a specific entity, attached via Script
    // e.g. "Taking the Idol triggers the boulder trap"
    Instance = 3
}

export enum ContributionStatus {
    // a law added some flavor and/or added some proposed mutations, but
    // isn't considering itself the final word; the Intent continues to propagate
    pass = 'PASS',

    // the Intent is determined to be impossible; roll back any queued changes and abort
    rejected = 'REJECTED',

    // the Intent has been fully handled; commit queued changes and stop propagation
    completed = 'COMPLETED'
}

export interface IntentPipelineConfig {
    confidenceThreshold: number
    biddingIdMatchPrice: number
    biddingComponentMatchPrice: number
    biddingPropsMatchPrice: number
    biddingTagsMatchPrice: number
}

export const defaultPipelineConfig: IntentPipelineConfig = Object.freeze({
    confidenceThreshold: 0.7,
    biddingIdMatchPrice: 100,
    biddingComponentMatchPrice: 10,
    biddingPropsMatchPrice: 20,
    biddingTagsMatchPrice: 2.5,
})

export interface Intent {
    name: string
    actor?: Entity
    target?: Entity

    // any tools or implements or other related entities
    auxiliary?: Array<Entity>
}

export interface IntentClassificationResponse {
    intent?: Intent
    confidence: number // normalized from 0 - 1
    dryRun: boolean
}


export interface LawContext {
    actor?: Entity
    target?: Entity
    ecsUtils: ReturnType<InstanceType<typeof ECS>['getReadonlyFacade']>

    // the list of auxiliaries (implements, tools, etc.) that the user
    // issued the command with, sorted in the order that produces
    // the highest specificity for the given Law (tie goes to user order)
    auxiliary?: Entity[]

    // the list of auxiliaries as they originally appeared in the
    // user's command, in case the Law cares about the actual order
    originalAuxiliaries?: Entity[]
}

export type EntityRef = Entity | string

export enum LawMutationOpType {
    update = 'UPDATE',
    set = 'SET',
    remove = 'REMOVE',
    destroy = 'DESTROY',
    create = 'CREATE',
}

export type MutationOp<ComponentSchema extends EngineComponentSchema> =
    | { op: LawMutationOpType.create,  alias?: string, components?: Partial<ComponentSchema & string>}
    | { op: LawMutationOpType.remove,  entity: EntityRef, component: keyof ComponentSchema & string }
    | { op: LawMutationOpType.update,  entity: EntityRef, component: keyof ComponentSchema & string, value: ComponentSchema[keyof ComponentSchema & string] } // Merges data
    | { op: LawMutationOpType.set,     entity: EntityRef, component: keyof ComponentSchema & string, value: ComponentSchema[keyof ComponentSchema & string] } // Replaces data completely
    | { op: LawMutationOpType.destroy, entity: EntityRef }

export interface Contribution<ComponentSchema extends EngineComponentSchema> {
    status: ContributionStatus
    mutations?: Array<MutationOp<ComponentSchema>>
    narrations?: Array<string>
    events?: Array<EngineEvent>
}

// expresses the criteria which constitute a scenario the Law is concerned with
// e.g. if the entity has component ToolComponent and ToolComponent.type === 'wrench'
export interface LawConcern<ComponentSchema extends EngineComponentSchema> {
    components?: Array<keyof ComponentSchema & string>
    props?: Array<{
        prop: string // strings must be in the format of ComponentName.propName or they are ignored
        value: string | number | boolean // the value that counts as a match
    }>
    tags?: Array<string>
    ids?: Array<string>
}

export interface LawBid<ComponentSchema extends EngineComponentSchema> {
    law: Law<ComponentSchema>;
    score: number;
    reorderedAuxiliaries?: Entity[]; // The data we want to save!
}

// a matcher represents a scenario that a Law cares about
// e.g. the actor is the player, the target is an NPC, and the aux is a sword
// the specificity of each concern in the matcher is added together,
// then whatever matcher has the highest total specificity is treated
// as the Law's specificity for a given Intent
export interface LawMatcher<ComponentSchema extends EngineComponentSchema> {
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

export interface Law<ComponentSchema extends EngineComponentSchema> {
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

export interface IntentClassificationModule {
    getIntentFromCommand: (command: string) => Promise<Array<IntentClassificationResponse>>
}
