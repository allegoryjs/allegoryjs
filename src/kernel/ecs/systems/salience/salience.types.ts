import type { EngineComponentSchema, System } from '@/kernel/ecs/ecs.types'

export const SalienceConfidence = {
  authoritative: 1.0,
  extreme: 0.83,
  high: 0.67,
  moderate: 0.5,
  low: 0.33,
  minimal: 0.17,
  zero: 0.0,
} as const

/**
 * @property focal - Absolute salience; the focal point of attention, e.g. something the player is inspecting
 * @property conspicuous - Very high salience; something clearly pertinent to the situation or exceedingly visible, e.g. a flashing neon sign within view of the player's character
 * @property prominent - High salience; something very likely to be referenced by the player, e.g. an NPC in the same room with a distinct outfit
 * @property standard - Baseline salience; something which the player could plausibly refer to, but which doesn't stand out as especially pertinent, e.g. one of the windows in a bus in which the player is seated
 * @property peripheral - Weak salience; background context or something somewhat unlikely for the player to care about, e.g. an unremarkable NPC in a crowd
 * @property vague - Very weak salience; barely perceptible or very unlikely for the player to refer to, e.g. a tree far in the rear-view mirror of a car
 * @property zero - Not salient; not perceptible, or not possible for the player to reference, e.g. a door in a different building which they've not yet seen
 */
export const SalienceScore = {
  focal: 1.0,
  conspicuous: 0.83,
  prominent: 0.67,
  standard: 0.5,
  peripheral: 0.33,
  vague: 0.17,
  zero: 0.0,
} as const

export interface SalienceVote {

}

export interface SalienceVoter extends System {
  voteSalience(): SalienceVote
}

export interface SalienceCacheData {}
