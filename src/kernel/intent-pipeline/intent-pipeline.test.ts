import { afterEach, describe, expect, mock, spyOn, it, beforeEach } from 'bun:test'

import EventBus from '@/helpers/event-bus/event-bus'
import { defaultEmitStreams } from '@/helpers/event-bus/event-bus'
import type LocalizationModule from '@/helpers/localization/localization'
import { DefaultLogger } from '@/helpers/logger/logger'
import type { Logger } from '@/helpers/logger/logger.types'
import type ECS from '@/kernel/ecs/ecs'
import type { EngineComponentSchema } from '@/kernel/ecs/ecs.types'
import IntentPipeline from '@/kernel/intent-pipeline/intent-pipeline'
import {
  ContributionStatus,
  LawLayer,
  type IntentClassificationModule,
  type IntentClassificationResponse,
  type IntentPipelineConfig,
  type Law,
} from '@/kernel/intent-pipeline/intent-pipeline.types'

// --- Test-only ECS schema extension ---
interface TestSchema extends EngineComponentSchema {
  TestComponent: { value: number }
}

describe('Intent Pipeline', () => {
  const mockEventBus = new EventBus()
  let emitSpy = spyOn(mockEventBus, 'emit')

  const mockEcs = {
    getEntityByPrettyId: mock(),
    entityHasComponent: mock(),
    isComponent: mock(),
    entityExists: mock(),
    getEntityComponentData: mock(),
    entityHasTag: mock(),
    getReadonlyFacade: mock(),
    createEntity: mock(),
    removeComponentFromEntity: mock(),
    destroyEntity: mock(),
    setComponentOnEntity: mock(),
    updateComponentData: mock(),
  }

  const mockConfigDefault: IntentPipelineConfig = Object.freeze({
    confidenceThreshold: 0.7,
    biddingIdMatchPrice: 100,
    biddingComponentMatchPrice: 10,
    biddingPropsMatchPrice: 20,
    biddingTagsMatchPrice: 2.5,
  })

  const mockI18n = {
    $t: mock(),
  } satisfies LocalizationModule

  const mockIntentClassificationModule = {
    getIntentFromCommand: mock(),
  } satisfies IntentClassificationModule

  const logger: Logger = new DefaultLogger({
    info: false,
    debug: false,
    error: false,
    warn: false,
  })

  let ip: IntentPipeline<TestSchema>

  beforeEach(() => {
    emitSpy = spyOn(mockEventBus, 'emit')
    ip = new IntentPipeline(
      mockEventBus,
      mockEcs as unknown as ECS<TestSchema>,
      mockIntentClassificationModule,
      mockI18n,
      mockConfigDefault,
      logger,
    )
  })

  afterEach(() => {
    mock.restore()
    mock.clearAllMocks()
  })

  it('has the expected public methods', () => {
    expect(typeof ip.handleCommand).toBe('function')
    expect(typeof ip.ratifyLaw).toBe('function')
    expect(typeof ip.repealLaw).toBe('function')
  })

  describe('handles invalid commands correctly', () => {
    it('emits an "unknown command" narration event when there are no intent responses given by the intent classification module', async () => {
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [])
      mockI18n.$t.mockImplementationOnce((slug: string) => {
        return slug === 'engine.unknown_command' ? 'correct' : 'incorrect'
      })
      await ip.handleCommand('test')

      expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledTimes(1)
      expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledWith('test')
      expect(mockI18n.$t).toHaveBeenCalledTimes(1)
      expect(mockI18n.$t).toHaveBeenCalledWith('engine.unknown_command')
      expect(emitSpy).toHaveBeenCalledTimes(1)
      expect(emitSpy).toHaveBeenCalledWith(
        defaultEmitStreams.narrate,
        expect.arrayContaining(['correct']),
      )
    })

    it('emits an "unknown command" narration event when the intent classification module returns at least one invalid intent', async () => {
      // invalid intent response: confidence below config threshold
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 0,
          intent: {},
        },
        {
          confidence: 1,
          intent: {},
        },
      ])
      mockI18n.$t.mockImplementation((slug: string) => {
        return slug === 'engine.unknown_command' ? 'correct' : 'incorrect'
      })

      await ip.handleCommand('test')

      expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledTimes(1)
      expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledWith('test')
      expect(mockI18n.$t).toHaveBeenCalledTimes(1)
      expect(mockI18n.$t).toHaveBeenCalledWith('engine.unknown_command')
      expect(emitSpy).toHaveBeenCalledTimes(1)
      expect(emitSpy).toHaveBeenCalledWith(
        defaultEmitStreams.narrate,
        expect.arrayContaining(['correct']),
      )

      // invalid intent response: null intent
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          intent: null,
        },
        {
          confidence: 1,
          intent: {},
        },
      ])

      await ip.handleCommand('test')

      expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledTimes(2)
      expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenLastCalledWith('test')
      expect(mockI18n.$t).toHaveBeenCalledTimes(2)
      expect(mockI18n.$t).toHaveBeenLastCalledWith('engine.unknown_command')
      expect(emitSpy).toHaveBeenCalledTimes(2)
      expect(emitSpy).toHaveBeenLastCalledWith(
        defaultEmitStreams.narrate,
        expect.arrayContaining(['correct']),
      )
    })
  })

  describe('handles valid commands correctly', () => {
    it('invokes the correct Law for a given command', async () => {
      const intentName = 'TEST_INTENT'
      const actorEntityId = 123
      const lawApplyMock = mock()

      lawApplyMock.mockImplementationOnce(() => ({
        status: ContributionStatus.pass,
      }))

      // register a Law which handles TEST_INTENT
      const testLaw: Law<TestSchema> = {
        layer: LawLayer.Core,
        name: 'test-law',
        intents: [intentName],
        apply: lawApplyMock,
        matchers: [
          {
            actor: {
              ids: [actorEntityId],
            },
          },
        ],
      }

      ip.ratifyLaw(testLaw)

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(
        () =>
          [
            {
              confidence: 1,
              dryRun: false,
              intent: {
                name: intentName,
                actor: actorEntityId,
              },
            },
          ] satisfies Array<IntentClassificationResponse>,
      )

      mockEcs.entityExists.mockImplementationOnce((entity: number) => entity === actorEntityId)

      await ip.handleCommand('test command')
      expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledTimes(1)

      expect(lawApplyMock).toHaveBeenCalledTimes(1)
      expect(lawApplyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: false,
          actor: actorEntityId,
        }),
      )
      expect(mockEcs.entityExists).toHaveBeenCalledTimes(1)
      expect(mockEcs.entityExists).toHaveBeenCalledWith(actorEntityId)
    })
  })

  describe('Law layer precedence and fallback', () => {
    it('invokes higher layer law over lower layer law', async () => {
      const intentName = 'LAYER_TEST_INTENT'
      const actorEntityId = 1
      const highLayerApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.completed,
      }))
      const lowLayerApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.pass,
      }))

      const highLayerLaw = {
        layer: LawLayer.Core + 1,
        name: 'high-layer-law',
        intents: [intentName],
        apply: highLayerApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      const lowLayerLaw = {
        layer: LawLayer.Core,
        name: 'low-layer-law',
        intents: [intentName],
        apply: lowLayerApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(lowLayerLaw)
      ip.ratifyLaw(highLayerLaw)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('layer test')
      expect(highLayerApply).toHaveBeenCalled()
      expect(lowLayerApply).not.toHaveBeenCalled()
    })
    it('does not invoke a law that does not handle the given intent', async () => {
      const intentName = 'LAYER_FALLBACK_INTENT'
      const actorEntityId = 2
      const highLayerApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.pass,
      }))
      const lowLayerApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.pass,
      }))
      const highLayerLaw = {
        layer: LawLayer.Core + 1,
        name: 'high-layer-law-fallback',
        intents: ['other-intent'],
        apply: highLayerApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      const lowLayerLaw = {
        layer: LawLayer.Core,
        name: 'low-layer-law-fallback',
        intents: [intentName],
        apply: lowLayerApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(lowLayerLaw)
      ip.ratifyLaw(highLayerLaw)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('layer fallback test')
      expect(highLayerApply).not.toHaveBeenCalled()
      expect(lowLayerApply).toHaveBeenCalled()
    })
  })

  describe('Law repeal', () => {
    it('does not invoke repealed law', async () => {
      const intentName = 'REPEAL_TEST_INTENT'
      const actorEntityId = 3
      const lawApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
      const testLaw = {
        layer: LawLayer.Core,
        name: 'repeal-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(testLaw)
      ip.repealLaw('repeal-law')
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('repeal test')
      expect(lawApply).not.toHaveBeenCalled()
    })
  })

  describe('Matcher logic', () => {
    it('matches by component', async () => {
      const intentName = 'COMPONENT_MATCH_INTENT'
      const actorEntityId = 4
      const lawApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
      const testLaw: Law<TestSchema> = {
        layer: LawLayer.Core,
        name: 'component-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [{ actor: { components: ['TestComponent'] } }],
      }
      ip.ratifyLaw(testLaw)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityHasComponent.mockImplementation(
        (entity, comp) => entity === actorEntityId && comp === 'TestComponent',
      )
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('component match test')
      expect(lawApply).toHaveBeenCalled()
    })
    it('matches by prop', async () => {
      const intentName = 'PROP_MATCH_INTENT'
      const actorEntityId = 5
      const lawApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
      const testLaw = {
        layer: LawLayer.Core,
        name: 'prop-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [
          {
            actor: {
              props: [
                {
                  prop: 'TestComponent.value',
                  value: 42,
                },
              ],
            },
          },
        ],
      }
      ip.ratifyLaw(testLaw)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.isComponent.mockImplementation((comp) => comp === 'TestComponent')
      mockEcs.getEntityComponentData.mockImplementation((entity, comp) =>
        entity === actorEntityId && comp === 'TestComponent' ? { value: 42 } : undefined,
      )
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('prop match test')
      expect(lawApply).toHaveBeenCalled()
    })
    it('matches by tag', async () => {
      const intentName = 'TAG_MATCH_INTENT'
      const actorEntityId = 6
      const lawApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
      const testLaw = {
        layer: LawLayer.Core,
        name: 'tag-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [{ actor: { tags: ['special'] } }],
      }
      ip.ratifyLaw(testLaw)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityHasTag.mockImplementation(
        (entity, tag) => entity === actorEntityId && tag === 'special',
      )
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('tag match test')
      expect(lawApply).toHaveBeenCalled()
    })
  })

  describe('Dry run handling', () => {
    it('passes dryRun flag to law context', async () => {
      const intentName = 'DRY_RUN_INTENT'
      const actorEntityId = 7
      const lawApply = mock().mockImplementationOnce((ctx) => {
        expect(ctx.dryRun).toBe(true)
        return { status: ContributionStatus.pass }
      })
      const testLaw = {
        layer: LawLayer.Core,
        name: 'dry-run-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(testLaw)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: true,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('dry run test')
      expect(lawApply).toHaveBeenCalled()
    })

    it('does not execute mutations or emit events when dryRun is true', async () => {
      const intentName = 'DRY_RUN_EXECUTION_TEST'
      const actorEntityId = 7

      const testLaw: Law<TestSchema> = {
        layer: LawLayer.Core,
        name: 'dry-run-execution-law',
        intents: [intentName],
        apply: (_ctx) =>
          Promise.resolve({
            status: ContributionStatus.pass,
            mutations: [
              {
                op: 'DESTROY' as any,
                entity: 99,
              },
            ],
            events: [
              {
                type: 'TEST_EVENT',
                payload: { foo: 'bar' },
              },
            ],
            narrations: ['Dry run narration'],
          }),
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(testLaw)

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: true,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      mockI18n.$t.mockImplementation((s: string) => s)

      const emitDynamicSpy = spyOn(mockEventBus, 'emitDynamic')

      await ip.handleCommand('dry run test')

      // Mutations should NOT be called
      expect(mockEcs.destroyEntity).not.toHaveBeenCalled()

      // Events should NOT be emitted
      expect(emitDynamicSpy).not.toHaveBeenCalled()

      // Narrations SHOULD still be emitted
      expect(emitSpy).toHaveBeenCalledWith(defaultEmitStreams.narrate, ['Dry run narration'])
    })

    it('executes mutations and emits events when dryRun is false', async () => {
      const intentName = 'NORMAL_RUN_EXECUTION_TEST'
      const actorEntityId = 7

      const testLaw: Law<TestSchema> = {
        layer: LawLayer.Core,
        name: 'normal-run-execution-law',
        intents: [intentName],
        apply: (_ctx) =>
          Promise.resolve({
            status: ContributionStatus.pass,
            mutations: [
              {
                op: 'DESTROY' as any,
                entity: 99,
              },
            ],
            events: [
              {
                type: 'TEST_EVENT',
                payload: { foo: 'bar' },
              },
            ],
            narrations: ['Normal run narration'],
          }),
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(testLaw)

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      mockI18n.$t.mockImplementation((s: string) => s)

      const emitDynamicSpy = spyOn(mockEventBus, 'emitDynamic')

      await ip.handleCommand('normal run test')

      // Mutations SHOULD be called
      expect(mockEcs.destroyEntity).toHaveBeenCalledWith(99)

      // Events SHOULD be emitted
      expect(emitDynamicSpy).toHaveBeenCalledWith('TEST_EVENT', { foo: 'bar' })

      // Narrations SHOULD be emitted
      expect(emitSpy).toHaveBeenCalledWith(defaultEmitStreams.narrate, ['Normal run narration'])
    })
  })

  describe('Edge cases', () => {
    it('handles no laws gracefully', async () => {
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: 'NO_LAW_INTENT',
            actor: 8,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      // no laws registered, so handleCommand should complete without error
      await ip.handleCommand('no law')
    })
    it('invokes all matching same-layer laws that return pass', async () => {
      const intentName = 'MULTI_MATCH_INTENT'
      const actorEntityId = 9
      const lawApply1 = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
      const lawApply2 = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
      const law1 = {
        layer: LawLayer.Core,
        name: 'multi-law-1',
        intents: [intentName],
        apply: lawApply1,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      const law2 = {
        layer: LawLayer.Core,
        name: 'multi-law-2',
        intents: [intentName],
        apply: lawApply2,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(law1)
      ip.ratifyLaw(law2)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('multi match test')
      expect(lawApply1).toHaveBeenCalledTimes(1)
      expect(lawApply2).toHaveBeenCalledTimes(1)
    })
    it('stops law execution on rejection and does not invoke subsequent laws', async () => {
      const intentName = 'CONFLICT_INTENT'
      const actorEntityId = 10
      const rejectApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.rejected,
      }))
      const completeApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.completed,
      }))
      const rejectLaw = {
        layer: LawLayer.Core,
        name: 'reject-law',
        intents: [intentName],
        apply: rejectApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      const completeLaw = {
        layer: LawLayer.Core,
        name: 'complete-law',
        intents: [intentName],
        apply: completeApply,
        matchers: [{ actor: { ids: [actorEntityId] } }],
      }
      ip.ratifyLaw(rejectLaw)
      ip.ratifyLaw(completeLaw)
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          dryRun: false,
          intent: {
            name: intentName,
            actor: actorEntityId,
          },
        },
      ])
      mockEcs.entityExists.mockImplementation(() => true)
      await ip.handleCommand('conflict test')
      expect(rejectApply).toHaveBeenCalledTimes(1)
      expect(completeApply).not.toHaveBeenCalled()
      expect(emitSpy).not.toHaveBeenCalled()
    })
  })

  describe('Localization fallback', () => {
    it('handles missing translation by propagating the error', async () => {
      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [])
      mockI18n.$t.mockImplementationOnce(() => {
        throw new Error('Missing translation')
      })
      expect(ip.handleCommand('unknown')).rejects.toThrow('Missing translation')
    })
  })

  describe('Mutation logic', () => {
    it('handles entity aliases in CREATE followed by UPDATE', async () => {
      const intentName = 'ALIAS_TEST'
      const goblinAlias = 'goblin_1'
      const goblinId = 42

      const lawApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.completed,
        mutations: [
          {
            op: 'CREATE',
            alias: goblinAlias,
          },
          {
            op: 'UPDATE',
            entity: goblinAlias,
            component: 'TestComponent',
            value: { value: 100 },
          },
        ],
      }))

      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'alias-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [{}],
      })

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          intent: { name: intentName },
        },
      ])

      mockEcs.createEntity.mockImplementationOnce(() => goblinId)

      await ip.handleCommand('spawn goblin')

      expect(mockEcs.createEntity).toHaveBeenCalledWith(goblinAlias)
      expect(mockEcs.updateComponentData).toHaveBeenCalledWith(goblinId, 'TestComponent', {
        value: 100,
      })
    })

    it('throws when mutation references an unknown alias', async () => {
      const intentName = 'BAD_ALIAS_TEST'
      const lawApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.completed,
        mutations: [
          {
            op: 'UPDATE',
            entity: 'unknown_alias',
            component: 'TestComponent',
            value: { value: 0 },
          },
        ],
      }))

      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'bad-alias-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [{}],
      })

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          intent: { name: intentName },
        },
      ])

      expect(ip.handleCommand('bad alias')).rejects.toThrow(/unknown alias 'unknown_alias'/)
    })
  })

  describe('Auxiliary reordering', () => {
    it('reorders auxiliary entities to find the best match', async () => {
      const intentName = 'REORDER_TEST'
      // User input: [E1, E2]
      // Law matcher: [Concern for E2, Concern for E1]
      const e1 = 101
      const e2 = 102

      const lawApply = mock().mockImplementationOnce((ctx) => {
        // Should receive auxiliaries in the reordered order: [E2, E1]
        expect(ctx.auxiliary).toEqual([e2, e1])
        expect(ctx.originalAuxiliaries).toEqual([e1, e2])
        return { status: ContributionStatus.completed }
      })

      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'reorder-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [
          {
            auxiliary: [
              { ids: [e2] }, // Matches e2 better
              { ids: [e1] }, // Matches e1 better
            ],
          },
        ],
      })

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          intent: {
            name: intentName,
            auxiliary: [e1, e2],
          },
        },
      ])

      mockEcs.entityExists.mockImplementation((id) => [e1, e2].includes(id))

      await ip.handleCommand('reorder test')
      expect(lawApply).toHaveBeenCalled()
    })
  })

  describe('Contribution processing', () => {
    it('emits events and narrations from contributions', async () => {
      const intentName = 'CONTRIBUTION_TEST'
      const lawApply = mock().mockImplementationOnce(() => ({
        status: ContributionStatus.completed,
        narrations: ['narration.1', 'narration.2'],
        events: [
          {
            type: 'CUSTOM_EVENT',
            payload: { data: 'test' },
          },
        ],
      }))

      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'contribution-law',
        intents: [intentName],
        apply: lawApply,
        matchers: [{}],
      })

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          intent: { name: intentName },
        },
      ])

      mockI18n.$t.mockImplementation((s) => `translated:${s}`)
      const emitDynamicSpy = spyOn(mockEventBus, 'emitDynamic')

      await ip.handleCommand('contribution test')

      expect(emitSpy).toHaveBeenCalledWith(defaultEmitStreams.narrate, ['translated:narration.1'])
      expect(emitSpy).toHaveBeenCalledWith(defaultEmitStreams.narrate, ['translated:narration.2'])
      expect(emitDynamicSpy).toHaveBeenCalledWith('CUSTOM_EVENT', { data: 'test' })
    })
  })

  describe('Multi-intent handling', () => {
    it('executes multiple intents sequentially', async () => {
      const intent1 = 'INTENT_1'
      const intent2 = 'INTENT_2'
      const apply1 = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
      const apply2 = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))

      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'law1',
        intents: [intent1],
        apply: apply1,
        matchers: [{}],
      })
      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'law2',
        intents: [intent2],
        apply: apply2,
        matchers: [{}],
      })

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          intent: { name: intent1 },
        },
        {
          confidence: 1,
          intent: { name: intent2 },
        },
      ])

      await ip.handleCommand('multi intent')
      expect(apply1).toHaveBeenCalled()
      expect(apply2).toHaveBeenCalled()
    })

    it('stops multi-intent loop if an intent is rejected', async () => {
      const intent1 = 'INTENT_REJECT'
      const intent2 = 'INTENT_SHOULD_SKIP'
      const apply1 = mock().mockImplementationOnce(() => ({ status: ContributionStatus.rejected }))
      const apply2 = mock()

      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'law-reject',
        intents: [intent1],
        apply: apply1,
        matchers: [{}],
      })
      ip.ratifyLaw({
        layer: LawLayer.Core,
        name: 'law-skip',
        intents: [intent2],
        apply: apply2,
        matchers: [{}],
      })

      mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
        {
          confidence: 1,
          intent: { name: intent1 },
        },
        {
          confidence: 1,
          intent: { name: intent2 },
        },
      ])

      await ip.handleCommand('reject loop')
      expect(apply1).toHaveBeenCalled()
      expect(apply2).not.toHaveBeenCalled()
    })
  })
})
