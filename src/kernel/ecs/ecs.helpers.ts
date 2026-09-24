import type ECS from '@/kernel/ecs/ecs'
import {
  SYSTEM_SCHEMA_COMPONENTS,
  type EcsReadonlyFacade,
  type EcsState,
  type EcsStateEnvelope,
  type EcsStateEnvelopeMeta,
  type Entity,
} from '@/kernel/ecs/ecs.types'
import { isPojo, isPositiveInteger, isString } from '@/utilities/schemer'

export function entityHasTag(ecs: EcsReadonlyFacade | ECS, entity: Entity, tag: string) {
  return ecs.getEntityComponentData(entity, SYSTEM_SCHEMA_COMPONENTS.tags).list.includes(tag)
}

function validateMetadata(obj: unknown): obj is EcsStateEnvelopeMeta {
  if (!isPojo(obj)) {
    return false
  }

  return (
    isPositiveInteger(obj.savedAt) &&
    [obj.gameId, obj.engineVersion, obj.gameVersion].every((meta) => isString(meta))
  )
}

function validateState(obj: unknown): obj is EcsState {
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

export function parseStateJson(stateString: string): EcsStateEnvelope {
  const { metadata, state } = JSON.parse(stateString)

  const isValidPojo = isPojo(metadata) && isPojo(state)

  if (!isValidPojo) {
    throw new Error('Fatal error parsing ECS state: state and/or metadata JSON is not a POJO')
  }

  const hasMeta = validateMetadata(metadata)

  if (!hasMeta) {
    throw new Error('Fatal error parsing ECS state: invalid metadata')
  }

  const dataShapeIsValid = validateState(state)

  if (!dataShapeIsValid) {
    throw new Error('Fatal error parsing state string: component data objects must be POJOs')
  }

  return {
    metadata,
    state,
  } as EcsStateEnvelope
}
