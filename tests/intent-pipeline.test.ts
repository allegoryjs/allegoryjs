import {
    afterEach,
    describe,
    expect,
    test,
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
    } satisfies ECS

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

    let ip: IntentPipeline


    beforeEach(() => {
        ip = new IntentPipeline(
            mockEmitter,
            mockEcs,
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
            mockI18n.$t.mockImplementationOnce((slug) => {
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
            mockI18n.$t.mockImplementation((slug) => {
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
            const testLaw: Law<EngineComponentSchema> = {
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
})
