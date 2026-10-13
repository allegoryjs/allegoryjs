import { ENGINE_LAYER, type EngineLayer } from '@/engine/engine.types'
import type { Logger } from '@/helpers/logger/logger.types'
import { InitializableSystem, SYSTEM_SCHEMA_COMPONENTS } from '@/kernel/ecs/ecs.types'
import type { ECS, Entity, Revision } from '@/kernel/ecs/ecs.types'

import type {
  SalienceSystemConfig,
  SalienceVote,
  SalienceVoter,
  VoteChannel,
} from './salience.types'

export class SalienceSystem extends InitializableSystem {
  readonly name = 'SalienceSystem'

  #ecs: ECS
  #lastSeenRevision: Revision = -1
  #voters: Set<SalienceVoter> = new Set()
  #votersStale = false

  protected logger: Logger

  constructor({ logger, ecs }: SalienceSystemConfig) {
    super()
    this.logger = logger
    this.#ecs = ecs
  }

  protected async onInit(): Promise<void> {
    if (this.initialized) {
      this.logger.errorAndThrow(`Cannot initialize ${this.name} system; system already initialized`)
    }

    this.#ecs.registerComponent(SYSTEM_SCHEMA_COMPONENTS.salienceCache, { serialize: false })
    this.initialized = true
    this.#lastSeenRevision = -1

    await this.onRun()

    this.logger.info(`Salience System initialized`)
  }

  protected async onDispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot dispose of ${this.name} system; system not initialized`)
    }

    this.#ecs.deregisterComponent(SYSTEM_SCHEMA_COMPONENTS.salienceCache)
    this.initialized = false
    this.logger.info('Salience System disposed; cache component removed from all entities')
  }

  protected async onRun(): Promise<void> {
    if (!this.initialized) {
      this.logger.errorAndThrow(`Cannot run ${this.name} system; system not initialized`)
    }

    if (!this.#votersStale && this.#lastSeenRevision === this.#ecs.currentRevision) {
      this.logger.debug(
        `In ${this.name}, the last seen ECS revision is the current one, and no voters have been added or removed; skipping salience cache rebuild`,
      )
      return
    }

    const entityVoteData = new Map<Entity, Map<VoteChannel, Map<EngineLayer, Set<SalienceVote>>>>()

    const oldCandidates = this.#ecs.getEntitiesByComponents(SYSTEM_SCHEMA_COMPONENTS.salienceCache)
    const candidates = this.#ecs.getEntitiesByComponents(SYSTEM_SCHEMA_COMPONENTS.noun)
    const staleCandidates = oldCandidates.difference(candidates)

    for (const staleEntity of staleCandidates) {
      this.#ecs.removeComponentFromEntity(staleEntity, SYSTEM_SCHEMA_COMPONENTS.salienceCache)
    }

    for (const voter of this.#voters) {
      const { layer } = voter

      for (const candidate of candidates) {
        const vote = voter.voteSalience(candidate, this.#ecs.readonlyFacade)

        if (vote) {
          const channelMap = entityVoteData.getOrInsert(candidate, new Map())
          const layerVoteMap = channelMap.getOrInsert(vote.channel, new Map())
          const voteSet = layerVoteMap.getOrInsert(layer, new Set())
          voteSet.add(vote)

          this.logger.debug(`Voter ${voter.name} submitted a salience vote for entity ${candidate}`)
          this.logger
            .silly`Voter ${voter.name} submitted the following salience vote for entity ${candidate}: ${vote}`
        } else {
          this.logger.debug(
            `Voter ${voter.name} abstained from submitting a vote for entity ${candidate} salience`,
          )
        }
      }
    }

    for (const [entity, channelMap] of entityVoteData) {
      const entityVotesByChannel = new Map<VoteChannel, Set<SalienceVote>>()

      for (const [channel, layerVotesMap] of channelMap) {
        const coreVotes = layerVotesMap.get(ENGINE_LAYER.core)
        const gameVotes = layerVotesMap.get(ENGINE_LAYER.game)
        const kitVotes = layerVotesMap.get(ENGINE_LAYER.kit)
        const instanceVotes = layerVotesMap.get(ENGINE_LAYER.instance)

        const filteredVotes = (instanceVotes ?? kitVotes ?? gameVotes ?? coreVotes)!

        entityVotesByChannel.set(channel, filteredVotes)

        this.logger
          .silly`After filtering based on engine layer, the set of salience votes for entity ${entity}, channel ${channel} is ${filteredVotes}`
      }

      const [total, byChannel] = this.#calculateSalience(entityVotesByChannel, entity)

      this.#ecs.setComponentOnEntity(entity, SYSTEM_SCHEMA_COMPONENTS.salienceCache, {
        salience: total,
        channels: byChannel,
      })
    }

    const votedEntities = new Set(entityVoteData.keys())
    const losers = candidates.difference(votedEntities)

    for (const loser of losers) {
      this.#ecs.setComponentOnEntity(loser, SYSTEM_SCHEMA_COMPONENTS.salienceCache, {
        salience: 0,
        channels: new Map(),
      })
    }

    this.#lastSeenRevision = this.#ecs.currentRevision
    this.#votersStale = false
  }

  registerVoter(voter: SalienceVoter) {
    const matchVoterName = (registeredVoter: SalienceVoter) => registeredVoter.name === voter.name
    if (this.#voters.values().some(matchVoterName)) {
      const old = this.#voters.values().find(matchVoterName)!
      this.logger.warn(
        `A Salience voter with name ${voter.name} already exists; replacing with new voter`,
      )
      this.logger.silly`Old voter: ${old}; new voter ${voter}`
      this.#voters.delete(old)
    } else if (this.#voters.has(voter)) {
      this.logger.warn(
        `The given Salience voter with name ${voter.name} is already registered; returning`,
      )
      return
    }

    this.#voters.add(voter)
    this.#votersStale = true
    this.logger.debug(`Registered new voter ${voter.name}`)
  }

  deregisterVoter(voter: string | SalienceVoter) {
    if (typeof voter === 'string') {
      const matchVoterName = (registeredVoter: SalienceVoter) => registeredVoter.name === voter

      const registered = this.#voters.values().find(matchVoterName)

      if (!registered) {
        this.logger.warn(
          `Attempted to deregister voter with name ${voter}, but no such voter is registered. Returning.`,
        )
        return
      }

      this.#voters.delete(registered)
      this.#votersStale = true
      this.logger.info(`Deregistered voter with name ${voter}`)
    } else {
      const matchVoterName = (registeredVoter: SalienceVoter) => registeredVoter.name === voter.name

      const registered = this.#voters.values().find(matchVoterName)

      if (!registered) {
        this.logger.warn(
          `Attempted to deregister voter with name ${voter.name}, but no such voter is registered. Returning.`,
        )
        this.logger.silly`Voter which was not found: ${voter}`
        return
      }

      this.#voters.delete(registered)
      this.#votersStale = true
      this.logger.info(`Deregistered voter with name ${voter.name}`)
      this.logger.silly`Voter which was deleted: ${voter}`
    }
  }

  #calculateSalience(
    voteData: Map<VoteChannel, Set<SalienceVote>>,
    entity: Entity,
  ): [number, Map<VoteChannel, number>] {
    const salienceByChannel = new Map<VoteChannel, number>()

    for (const [channel, votes] of voteData) {
      const weightedAvgSalienceFactors = votes.values().reduce(
        (acc, vote) => {
          const [numerator, denominator] = acc
          const newNumerator = numerator + vote.confidence * vote.salience
          const newDenominator = denominator + vote.confidence

          return [newNumerator, newDenominator] as [number, number]
        },
        [0, 0] as [number, number],
      )

      const [weightedNumerator, weightedDenominator] = weightedAvgSalienceFactors

      const weightedAvgSalience =
        weightedDenominator === 0 ? 0 : weightedNumerator / weightedDenominator

      this.logger
        .silly`For entity ${entity} -> channel ${channel}, the confidence-weighted average of salience scores is ${weightedAvgSalience}`

      salienceByChannel.set(channel, weightedAvgSalience)
    }

    const numberOfChannels = salienceByChannel.size
    const averageSalience =
      salienceByChannel.values().reduce((acc, salience) => acc + salience, 0) / numberOfChannels

    this.logger.debug(`Final salience score for entity ${entity} is ${averageSalience}`)

    return [averageSalience, salienceByChannel]
  }
}
