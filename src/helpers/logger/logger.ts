import type { Logger, LoggerChannelOpts } from '@/helpers/logger/logger.types'

/**
 * Responsible for logging messages. Defaults to always printing warnings and errors.
 */
export class DefaultLogger implements Logger {
  #enableInfo: boolean
  #enableDebug: boolean
  #enableError: boolean
  #enableWarn: boolean

  constructor(opts: Partial<LoggerChannelOpts> = {}) {
    this.#enableInfo = opts.info ?? false
    this.#enableDebug = opts.debug ?? false
    this.#enableError = opts.error ?? true
    this.#enableWarn = opts.warn ?? true
  }

  setLevel(level: 'error' | 'warn' | 'info' | 'debug' | 'silent') {
    const levels = {
      silent: {
        error: false,
        warn: false,
        info: false,
        debug: false,
      },
      error: {
        error: true,
        warn: false,
        info: false,
        debug: false,
      },
      warn: {
        error: true,
        warn: true,
        info: false,
        debug: false,
      },
      info: {
        error: true,
        warn: true,
        info: true,
        debug: false,
      },
      debug: {
        error: true,
        warn: true,
        info: true,
        debug: true,
      },
    }
    const config = levels[level]
    this.#enableError = config.error
    this.#enableWarn = config.warn
    this.#enableInfo = config.info
    this.#enableDebug = config.debug
  }

  info(...args: any[]) {
    if (this.#enableInfo) {
      console.info('[INFO]', ...args)
    }
  }

  debug(...args: any[]) {
    if (this.#enableDebug) {
      console.debug('[DEBUG]', ...args)
    }
  }

  error(...args: any[]) {
    if (this.#enableError) {
      console.error('[ERROR]', ...args)
    }
  }

  warn(...args: any[]) {
    if (this.#enableWarn) {
      console.warn('[WARN]', ...args)
    }
  }
}
