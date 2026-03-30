import {
    afterEach,
    describe,
    expect,
    test,
    mock,
} from 'bun:test'

import IntentPipeline from '../src/intent-pipeline'
import type { IntentClassificationModule, IntentPipelineConfig } from '../src/intent-pipeline-types'
import type Emitter from '../src/emitter'
import type LocalizationModule from '../src/localization'
import type ECS from '../src/ecs'

describe('Intent Pipeline', () => {
    const mockEmitter = {
        emit: mock()
    } as unknown as Emitter

    const mockEcs = {
        getEntityByPrettyId: mock(),
        entityHasComponent: mock(),
        isComponent: mock(),
        getEntityComponentData: mock(),
        entityHasTag: mock(),
        getReadonlyFacade: mock(),
        createEntity: mock(),
        removeComponentFromEntity: mock(),
        destroyEntity: mock(),
        setComponentOnEntity: mock(),
        updateComponentData: mock(),
    } as unknown as ECS

    const mockConfigDefault: IntentPipelineConfig = Object.freeze({
        confidenceThreshold: 0.7,
        biddingIdMatchPrice: 100,
        biddingComponentMatchPrice: 10,
        biddingPropsMatchPrice: 20,
        biddingTagsMatchPrice: 2.5,
    })

    const mockI18n = {
        $t: mock()
    } as unknown as LocalizationModule

    const mockIntentClassificationModule: IntentClassificationModule = {
        getIntentFromCommand: mock()
    }

    afterEach(() => {
        mock.restore();
        mock.clearAllMocks();
    })
})
