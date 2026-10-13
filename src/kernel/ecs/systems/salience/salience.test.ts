import { describe, expect, mock, test } from 'bun:test'

import { ENGINE_LAYER, type EngineLayer } from '@/engine/engine.types'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import ECS from '@/kernel/ecs/ecs'
import { SYSTEM_SCHEMA_COMPONENTS } from '@/kernel/ecs/ecs.types'
import { SalienceSystem } from '@/kernel/ecs/systems/salience/salience.system'
import {
  SALIENCE_CONFIDENCE,
  SALIENCE_SCORE,
  type SalienceConfidence,
  type SalienceScore,
  type SalienceVote,
  type SalienceVoter,
} from '@/kernel/ecs/systems/salience/salience.types'

function makeLogger(): Logger {
  return new DefaultLogger({
    channelOpts: {
      info: false,
      debug: false,
      error: false,
      warn: false,
      silly: false,
    },
  })
}

function makeECS(): ECS {
  return new ECS(makeLogger())
}

function makeSystem(ecs: ECS): SalienceSystem {
  return new SalienceSystem({ ecs, logger: makeLogger() })
}

function vote(
  channel: string,
  salience: SalienceScore,
  confidence: SalienceConfidence,
): SalienceVote {
  return { channel, salience, confidence }
}

function fixedVoter(name: string, layer: EngineLayer, theVote: SalienceVote | null): SalienceVoter {
  return { name, layer, voteSalience: () => theVote }
}

// ─── System Name & Constructor ──────────────────────────────────────

describe('SalienceSystem - constructor and name', () => {
  test('returns "SalienceSystem" as system name', () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    expect(system.name).toBe('SalienceSystem')
  })
})

// ─── Lifecycle: onInit, onDispose, onRun ────────────────────────────

describe('SalienceSystem - lifecycle', () => {
  test('registers SalienceCache component in ECS on init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    expect(ecs.isComponent('SalienceCache')).toBe(false)

    await system.init()
    expect(ecs.isComponent('SalienceCache')).toBe(true)
  })

  test('throws if init is called when already initialized', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.init()

    expect(system.init()).rejects.toThrow('system already initialized')
  })

  test('throws if run is called before init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    expect(system.run()).rejects.toThrow('system not initialized')
  })

  test('throws if dispose is called before init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    expect(system.dispose()).rejects.toThrow('system not initialized')
  })

  test('deregisters SalienceCache component on dispose', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.init()
    expect(ecs.isComponent('SalienceCache')).toBe(true)

    await system.dispose()
    expect(ecs.isComponent('SalienceCache')).toBe(false)
  })

  test('can be re-initialized after disposal', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    await system.init()
    await system.dispose()
    expect(ecs.isComponent('SalienceCache')).toBe(false)

    await system.init()
    expect(ecs.isComponent('SalienceCache')).toBe(true)
  })
})

// ─── Voter Registration & Deregistration ────────────────────────────

describe('SalienceSystem - voter registration', () => {
  test('replaces a voter registered under the same name', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    // The focal voter was replaced by the zero voter, so the score is 0 rather than an average of the two.
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(0)
  })

  test('deregisterVoter by name removes the voter', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.deregisterVoter('sight')

    await system.init()

    expect(ecs.entityHasComponent(entity, 'SalienceCache')).toBe(false)
  })

  test('deregisterVoter by reference removes the voter', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    const voter = fixedVoter(
      'sight',
      ENGINE_LAYER.game,
      vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
    )
    system.registerVoter(voter)
    system.deregisterVoter(voter)

    await system.init()

    expect(ecs.entityHasComponent(entity, 'SalienceCache')).toBe(false)
  })

  test('deregisterVoter does not throw for an unknown voter', () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)

    expect(() => system.deregisterVoter('missing')).not.toThrow()
    expect(() => system.deregisterVoter(fixedVoter('ghost', ENGINE_LAYER.game, null))).not.toThrow()
  })
})

// ─── Voter Staleness Rebuilds ────────────────────────────────────────

describe('SalienceSystem - voter staleness rebuilds', () => {
  test('rebuilds cache when a voter is registered after init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    await system.init()
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(0)

    system.registerVoter(
      fixedVoter(
        'focus',
        ENGINE_LAYER.instance,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    await system.run()

    // The instance-layer voter supersedes the game-layer voter, so salience rises to focal.
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(1)
  })

  test('rebuilds cache when a voter is deregistered by name after init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'focus',
        ENGINE_LAYER.instance,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    await system.init()
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(1)

    system.deregisterVoter('focus')
    await system.run()

    // Only the game-layer zero voter remains.
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(0)
  })

  test('rebuilds cache when a voter is deregistered by reference after init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    const focus = fixedVoter(
      'focus',
      ENGINE_LAYER.instance,
      vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
    )
    system.registerVoter(focus)
    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    await system.init()
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(1)

    system.deregisterVoter(focus)
    await system.run()

    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(0)
  })

  test('rebuilds cache when a voter is replaced by name after init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    await system.init()
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(1)

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    await system.run()

    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(0)
  })
})

// ─── Cache Building & Scoring ───────────────────────────────────────

describe('SalienceSystem - cache building and scoring', () => {
  test('computes a confidence-weighted average for a single channel', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    const cache = ecs.getEntityComponentData(entity, 'SalienceCache')
    expect(cache?.channels.get('visual')).toBe(1)
    expect(cache?.salience).toBe(1)
  })

  test('averages multiple votes on the same channel', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'a',
        ENGINE_LAYER.core,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.high),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'b',
        ENGINE_LAYER.core,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.high),
      ),
    )

    await system.init()

    // (0.67 * 1 + 0.67 * 0) / (0.67 + 0.67) = 0.5
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.channels.get('visual')).toBe(0.5)
  })

  test('weights votes by confidence', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'a',
        ENGINE_LAYER.core,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'b',
        ENGINE_LAYER.core,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.moderate),
      ),
    )

    await system.init()

    // (1 * 1 + 0.5 * 0) / (1 + 0.5) = 2/3
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.channels.get('visual')).toBeCloseTo(
      2 / 3,
    )
  })

  test('averages channel scores into an overall salience', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.core,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'hearing',
        ENGINE_LAYER.core,
        vote('audio', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    const cache = ecs.getEntityComponentData(entity, 'SalienceCache')
    expect(cache?.channels.get('visual')).toBe(1)
    expect(cache?.channels.get('audio')).toBe(0)
    expect(cache?.salience).toBe(0.5)
  })

  test('handles zero-confidence votes without producing NaN', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.core,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.zero),
      ),
    )

    await system.init()

    const cache = ecs.getEntityComponentData(entity, 'SalienceCache')
    expect(cache?.channels.get('visual')).toBe(0)
    expect(cache?.salience).toBe(0)
    expect(Number.isNaN(cache?.salience)).toBe(false)
  })

  test('leaves no cache when every voter abstains', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(fixedVoter('sight', ENGINE_LAYER.game, null))

    await system.init()

    expect(ecs.entityHasComponent(entity, 'SalienceCache')).toBe(false)
  })
})

// ─── Engine Layer Filtering ─────────────────────────────────────────

describe('SalienceSystem - engine layer filtering', () => {
  test('higher engine layer overrides lower layer votes on the same channel', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'generic',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'specific',
        ENGINE_LAYER.instance,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    const cache = ecs.getEntityComponentData(entity, 'SalienceCache')
    // The instance-layer vote supersedes the game-layer vote rather than being averaged with it.
    expect(cache?.channels.get('visual')).toBe(1)
    expect(cache?.salience).toBe(1)
  })

  test('falls back to lower layers for channels the higher layer does not cover', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'core',
        ENGINE_LAYER.core,
        vote('audio', SALIENCE_SCORE.standard, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'instance',
        ENGINE_LAYER.instance,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    const cache = ecs.getEntityComponentData(entity, 'SalienceCache')
    expect(cache?.channels.get('visual')).toBe(1)
    expect(cache?.channels.get('audio')).toBe(SALIENCE_SCORE.standard)
    expect(cache?.salience).toBe((1 + SALIENCE_SCORE.standard) / 2)
  })

  test('combines multiple voters within the winning layer only', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'game',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.standard, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'inst1',
        ENGINE_LAYER.instance,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )
    system.registerVoter(
      fixedVoter(
        'inst2',
        ENGINE_LAYER.instance,
        vote('visual', SALIENCE_SCORE.zero, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    const cache = ecs.getEntityComponentData(entity, 'SalienceCache')
    // Winning layer (instance) average is (1 + 0) / 2 = 0.5; the game-layer vote is dropped.
    expect(cache?.channels.get('visual')).toBe(0.5)
    expect(cache?.salience).toBe(0.5)
  })
})

// ─── Entity Eligibility & Stale Cache Cleanup ───────────────────────

describe('SalienceSystem - entity eligibility and stale cleanup', () => {
  test('does not build cache for entities without a Noun', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('unnamed')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    expect(ecs.entityHasComponent(entity, 'SalienceCache')).toBe(false)
  })

  test('removes SalienceCache when an entity loses its Noun', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()
    expect(ecs.entityHasComponent(entity, 'SalienceCache')).toBe(true)

    ecs.removeComponentFromEntity(entity, SYSTEM_SCHEMA_COMPONENTS.noun)
    await system.run()

    expect(ecs.entityHasComponent(entity, 'SalienceCache')).toBe(false)
  })
})

// ─── Revision Tracking & Incremental Rebuilding ─────────────────────

describe('SalienceSystem - revision tracking', () => {
  test('builds cache for pre-existing entities during init', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const entity = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()

    expect(ecs.entityHasComponent(entity, 'SalienceCache')).toBe(true)
    expect(ecs.getEntityComponentData(entity, 'SalienceCache')?.salience).toBe(1)
  })

  test('skips rebuild when the ECS revision has not changed', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    ecs.createEntity('goblin', 'goblin')

    const voteSpy = mock(() =>
      vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
    )
    system.registerVoter({ name: 'sight', layer: ENGINE_LAYER.game, voteSalience: voteSpy })

    await system.init()
    const callsAfterInit = voteSpy.mock.calls.length
    expect(callsAfterInit).toBe(1)

    await system.run()
    expect(voteSpy.mock.calls.length).toBe(callsAfterInit)
  })

  test('rebuilds cache when a new noun entity is created', async () => {
    const ecs = makeECS()
    const system = makeSystem(ecs)
    const first = ecs.createEntity('goblin', 'goblin')

    system.registerVoter(
      fixedVoter(
        'sight',
        ENGINE_LAYER.game,
        vote('visual', SALIENCE_SCORE.focal, SALIENCE_CONFIDENCE.authoritative),
      ),
    )

    await system.init()
    expect(ecs.entityHasComponent(first, 'SalienceCache')).toBe(true)

    const second = ecs.createEntity('troll', 'troll')
    await system.run()

    expect(ecs.entityHasComponent(second, 'SalienceCache')).toBe(true)
    expect(ecs.getEntityComponentData(second, 'SalienceCache')?.salience).toBe(1)
  })
})
