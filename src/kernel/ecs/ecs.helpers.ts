import { isPojo, isPositiveInteger, isString } from '@/utilities/schemer'

import type {
    EcsState,
    EcsStateEnvelope,
    EcsStateEnvelopeMeta,
    EngineComponentSchema,
} from '@/kernel/ecs/ecs.types'
import type { POJO } from '@/utilities/schemer/schemer.types'

function validateMetadata(obj: unknown): obj is EcsStateEnvelopeMeta {
    if (!isPojo(obj)) {
        return false
    }

    return isPositiveInteger(obj.savedAt) && [
        obj.gameId,
        obj.engineVersion,
        obj.gameVersion,
    ].every(meta => isString(meta))
}

function validateState<
    ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema,
>(obj: unknown): obj is EcsState<ComponentSchema> {
    if (!isPojo(obj)) {
        return false
    }

    return Object.entries(obj).every(([entityId, componentData]) => {
        const validEntityId = isPositiveInteger(+entityId)

        if (!validEntityId) {
            throw new Error(`Fatal error loading ECS state: ${entityId} is not a valid entity ID`)
        }

        const componentDataIsValid = isPojo(componentData)

        return validEntityId && componentDataIsValid
    })
}

export function serializeState() {

}

export function parseStateJson<
    ComponentSchema extends EngineComponentSchema & Record<string, POJO> = EngineComponentSchema
>(stateString: string): EcsStateEnvelope<ComponentSchema> {
    const { metadata, state } = JSON.parse(stateString)

    const isValidPojo = isPojo(metadata) && isPojo(state)

    if (!isValidPojo) {
        throw new Error('Fatal error parsing ECS state: state and/or metadata JSON is not a POJO')
    }

    const hasMeta = validateMetadata(metadata)


    if (!hasMeta) {
        throw new Error('Fatal error parsing ECS state: invalid metadata')
    }

    const dataShapeIsValid = validateState<ComponentSchema>(state)

    if (!dataShapeIsValid) {
        throw new Error('Fatal error parsing state string: component data objects must be POJOs')
    }

    return {
        metadata,
        state,
    } as EcsStateEnvelope<ComponentSchema>
}
