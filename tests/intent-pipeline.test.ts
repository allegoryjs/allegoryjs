import {
    afterEach,
    describe,
    expect,
    mock,
    it,
    beforeEach,
} from 'bun:test'

import IntentPipeline from '../src/intent-pipeline'
import { ContributionStatus, LawLayer, type IntentClassificationModule, type IntentClassificationResponse, type IntentPipelineConfig, type Law } from '../src/intent-pipeline-types'
import type Emitter from '../src/emitter'
import type LocalizationModule from '../src/localization'
import type ECS from '../src/ecs'
import { defaultEmitStreams } from '../src/emitter'
import type { EngineComponentSchema } from '../src/ecs'

// --- Test-only ECS schema extension ---
interface TestSchema extends EngineComponentSchema {
    TestComponent: { value: number }
}

import { DefaultLogger, type Logger } from '../src/logger'

describe('Intent Pipeline', () => {
    const mockEmitter = {
        emit: mock()
    } satisfies Emitter

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
        $t: mock()
    } satisfies LocalizationModule

    const mockIntentClassificationModule = {
        getIntentFromCommand: mock()
    } satisfies IntentClassificationModule

    const logger: Logger = new DefaultLogger({
        info: true,
        debug: true,
        error: true,
        warn: true,
    })

    let ip: IntentPipeline<TestSchema>

    beforeEach(() => {
        ip = new IntentPipeline(
            mockEmitter,
            mockEcs as unknown as ECS<TestSchema>,
            mockIntentClassificationModule,
            mockI18n,
            mockConfigDefault,
            logger,
        )
    })

    afterEach(() => {
        mock.restore();
        mock.clearAllMocks();
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
            expect(mockEmitter.emit).toHaveBeenCalledTimes(1)
            expect(mockEmitter.emit).toHaveBeenCalledWith(defaultEmitStreams.narrate, expect.arrayContaining(['correct']))
        })

        it('emits an "unknown command" narration event when the intent classification module returns at least one invalid intent', async () => {
            // invalid intent response: confidence below config threshold
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
                {
                    confidence: 0,
                    intent: {},
                }, {
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
            expect(mockEmitter.emit).toHaveBeenCalledTimes(1)
            expect(mockEmitter.emit).toHaveBeenCalledWith(defaultEmitStreams.narrate, expect.arrayContaining(['correct']))

            // invalid intent response: null intent
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [
                {
                    confidence: 1,
                    intent: null,
                }, {
                    confidence: 1,
                    intent: {},
                },
            ])

            await ip.handleCommand('test')

            expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledTimes(2)
            expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenLastCalledWith('test')
            expect(mockI18n.$t).toHaveBeenCalledTimes(2)
            expect(mockI18n.$t).toHaveBeenLastCalledWith('engine.unknown_command')
            expect(mockEmitter.emit).toHaveBeenCalledTimes(2)
            expect(mockEmitter.emit).toHaveBeenLastCalledWith(defaultEmitStreams.narrate, expect.arrayContaining(['correct']))
        })
    })

    describe('handles valid commands correctly', () => {
        it('invokes the correct Law for a given command', async () => {
            const intentName = 'TEST_INTENT'
            const actorEntityId = 123
            const lawApplyMock = mock()

            lawApplyMock.mockImplementationOnce(() => ({
                status: ContributionStatus.pass
            }))

            // register a Law which handles TEST_INTENT
            const testLaw: Law<TestSchema> = {
                layer: LawLayer.Core,
                name: 'test-law',
                intents: [intentName],
                apply: lawApplyMock,
                matchers: [{
                    actor: {
                        ids: [actorEntityId]
                    }
                }]
            }

            ip.ratifyLaw(testLaw)

            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: {
                    name: intentName,
                    actor: actorEntityId,
                }
            }] satisfies Array<IntentClassificationResponse>)

            mockEcs.entityExists.mockImplementationOnce(
                (entity: number) => entity === actorEntityId
            )

            await ip.handleCommand('test command')
            expect(mockIntentClassificationModule.getIntentFromCommand).toHaveBeenCalledTimes(1)

            expect(lawApplyMock).toHaveBeenCalledTimes(1)
            expect(lawApplyMock).toHaveBeenCalledWith(expect.objectContaining({
                dryRun: false,
                actor: actorEntityId,
            }))
            expect(mockEcs.entityExists).toHaveBeenCalledTimes(1)
            expect(mockEcs.entityExists).toHaveBeenCalledWith(actorEntityId)
        })
    })

    describe('Law layer precedence and fallback', () => {
        it('invokes higher layer law over lower layer law', async () => {
            const intentName = 'LAYER_TEST_INTENT'
            const actorEntityId = 1
            const highLayerApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.completed }))
            const lowLayerApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))

            const highLayerLaw = {
                layer: LawLayer.Core + 1,
                name: 'high-layer-law',
                intents: [intentName],
                apply: highLayerApply,
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            const lowLayerLaw = {
                layer: LawLayer.Core,
                name: 'low-layer-law',
                intents: [intentName],
                apply: lowLayerApply,
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            ip.ratifyLaw(lowLayerLaw)
            ip.ratifyLaw(highLayerLaw)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
            mockEcs.entityExists.mockImplementation(() => true)
            await ip.handleCommand('layer test')
            expect(highLayerApply).toHaveBeenCalled()
            expect(lowLayerApply).not.toHaveBeenCalled()
        })
        it('does not invoke a law that does not handle the given intent', async () => {
            const intentName = 'LAYER_FALLBACK_INTENT'
            const actorEntityId = 2
            const highLayerApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
            const lowLayerApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.pass }))
            const highLayerLaw = {
                layer: LawLayer.Core + 1,
                name: 'high-layer-law-fallback',
                intents: ['other-intent'],
                apply: highLayerApply,
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            const lowLayerLaw = {
                layer: LawLayer.Core,
                name: 'low-layer-law-fallback',
                intents: [intentName],
                apply: lowLayerApply,
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            ip.ratifyLaw(lowLayerLaw)
            ip.ratifyLaw(highLayerLaw)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
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
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            ip.ratifyLaw(testLaw)
            ip.repealLaw('repeal-law')
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
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
                matchers: [{ actor: { components: ['TestComponent'] } }]
            }
            ip.ratifyLaw(testLaw)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
            mockEcs.entityHasComponent.mockImplementation((entity, comp) => entity === actorEntityId && comp === 'TestComponent')
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
                matchers: [{ actor: { props: [{ prop: 'TestComponent.value', value: 42 }] } }]
            }
            ip.ratifyLaw(testLaw)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
            mockEcs.isComponent.mockImplementation((comp) => comp === 'TestComponent')
            mockEcs.getEntityComponentData.mockImplementation((entity, comp) => (entity === actorEntityId && comp === 'TestComponent') ? { value: 42 } : undefined)
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
                matchers: [{ actor: { tags: ['special'] } }]
            }
            ip.ratifyLaw(testLaw)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
            mockEcs.entityHasTag.mockImplementation((entity, tag) => entity === actorEntityId && tag === 'special')
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
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            ip.ratifyLaw(testLaw)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: true,
                intent: { name: intentName, actor: actorEntityId }
            }])
            mockEcs.entityExists.mockImplementation(() => true)
            await ip.handleCommand('dry run test')
            expect(lawApply).toHaveBeenCalled()
        })
    })

    describe('Edge cases', () => {
        it('handles no laws gracefully', async () => {
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: 'NO_LAW_INTENT', actor: 8 }
            }])
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
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            const law2 = {
                layer: LawLayer.Core,
                name: 'multi-law-2',
                intents: [intentName],
                apply: lawApply2,
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            ip.ratifyLaw(law1)
            ip.ratifyLaw(law2)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
            mockEcs.entityExists.mockImplementation(() => true)
            await ip.handleCommand('multi match test')
            expect(lawApply1).toHaveBeenCalledTimes(1)
            expect(lawApply2).toHaveBeenCalledTimes(1)
        })
        it('stops law execution on rejection and does not invoke subsequent laws', async () => {
            const intentName = 'CONFLICT_INTENT'
            const actorEntityId = 10
            const rejectApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.rejected }))
            const completeApply = mock().mockImplementationOnce(() => ({ status: ContributionStatus.completed }))
            const rejectLaw = {
                layer: LawLayer.Core,
                name: 'reject-law',
                intents: [intentName],
                apply: rejectApply,
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            const completeLaw = {
                layer: LawLayer.Core,
                name: 'complete-law',
                intents: [intentName],
                apply: completeApply,
                matchers: [{ actor: { ids: [actorEntityId] } }]
            }
            ip.ratifyLaw(rejectLaw)
            ip.ratifyLaw(completeLaw)
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [{
                confidence: 1,
                dryRun: false,
                intent: { name: intentName, actor: actorEntityId }
            }])
            mockEcs.entityExists.mockImplementation(() => true)
            await ip.handleCommand('conflict test')
            expect(rejectApply).toHaveBeenCalledTimes(1)
            expect(completeApply).not.toHaveBeenCalled()
            expect(mockEmitter.emit).not.toHaveBeenCalled()
        })
    })

    describe('Localization fallback', () => {
        it('handles missing translation by propagating the error', async () => {
            mockIntentClassificationModule.getIntentFromCommand.mockImplementationOnce(() => [])
            mockI18n.$t.mockImplementationOnce(() => { throw new Error('Missing translation') })
            await expect(ip.handleCommand('unknown')).rejects.toThrow('Missing translation')
        })
    })
})
