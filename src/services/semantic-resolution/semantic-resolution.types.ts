import type { Logger } from '@/helpers/logger/logger.types'
import type { EcsReadonlyFacade } from '@/kernel/ecs/ecs.types'

export interface SemanticResolutionOpts {
  ecsFacade: EcsReadonlyFacade

  logger?: Logger
}
