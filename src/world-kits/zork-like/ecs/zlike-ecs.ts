import type { Logger } from '@/helpers/logger/logger.types'
import DefaultECS from '@/kernel/ecs/ecs'
import type { EcsConfig, Entity } from '@/kernel/ecs/ecs.types'
import { ZLIKE_SYSTEM_COMPONENTS, type ZLikeECS } from '@/world-kits/zork-like/ecs/zlike-ecs.types'


export default class DefaultZLikeECS extends DefaultECS implements ZLikeECS {

  constructor(logger: Logger, config: EcsConfig = {}) {
    super(logger, config)

    this.components.set(ZLIKE_SYSTEM_COMPONENTS.noun, new Map())
    this.logger.debug('ECS (as ZLikeECS) also initialized the built-in Noun component')
  }

  override createEntity(metaId?: string, noun?: string): Entity {
    const id = super.createEntity(metaId)

    if (noun) {
      this.setComponentOnEntity(id, ZLIKE_SYSTEM_COMPONENTS.noun, { noun })
      this.logger.debug(`Set noun ${noun} on entity ${id}`)
    }

    return id
  }
}
