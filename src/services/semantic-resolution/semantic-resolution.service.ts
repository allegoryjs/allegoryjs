import type { Logger } from '@/helpers/logger/logger.types'
import type { EcsReadonlyFacade } from '@/kernel/ecs/ecs.types'
import type { SemanticResolutionOpts } from '@/services/semantic-resolution/semantic-resolution.types'

import { DefaultLogger } from '@/helpers/logger/logger'

export class SemanticResolutionService {
  #ecsFacade: EcsReadonlyFacade
  #logger: Logger

  constructor({ ecsFacade, logger }: SemanticResolutionOpts) {
    this.#ecsFacade = ecsFacade

    this.#logger = logger ?? new DefaultLogger
  }

  
}
