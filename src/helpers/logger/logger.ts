import type { Logger, LoggerChannelOpts, LoggerLevels } from '@/helpers/logger/logger.types'

/**
 * Responsible for logging messages. Defaults to always printing warnings and errors.
 */
export class DefaultLogger implements Logger {
  #enableInfo: boolean
  #enableDebug: boolean
  #enableError: boolean
  #enableWarn: boolean
  #enableSilly: boolean

  constructor(opts: Partial<LoggerChannelOpts> = {}) {
    this.#enableSilly = opts.silly ?? false
    this.#enableDebug = opts.debug ?? false
    this.#enableInfo = opts.info ?? false
    this.#enableWarn = opts.warn ?? true
    this.#enableError = opts.error ?? true
  }

  setLevel(level: LoggerLevels) {
    const levels = {
      silent: {
        error: false,
        warn: false,
        info: false,
        debug: false,
        silly: false,
      },
      error: {
        error: true,
        warn: false,
        info: false,
        debug: false,
        silly: false,
      },
      warn: {
        error: true,
        warn: true,
        info: false,
        debug: false,
        silly: false,
      },
      info: {
        error: true,
        warn: true,
        info: true,
        debug: false,
        silly: false,
      },
      debug: {
        error: true,
        warn: true,
        info: true,
        debug: true,
        silly: false,
      },
      silly: {
        error: true,
        warn: true,
        info: true,
        debug: true,
        silly: true,
      },
    }
    const config = levels[level]
    this.#enableError = config.error
    this.#enableWarn = config.warn
    this.#enableInfo = config.info
    this.#enableDebug = config.debug
    this.#enableSilly = config.silly
  }

  info(...args: any[]) {
    if (!this.#enableInfo) {
      return
    }
    console.info('[INFO]', ...args)
  }

  debug(...args: any[]) {
    if (!this.#enableDebug) {
      return
    }
    console.debug('[DEBUG]', ...args)
  }

  error(...args: any[]) {
    if (!this.#enableError) {
      return
    }
    console.error('[ERROR]', ...args)
  }

  errorAndThrow(message: string): never {
    this.error(message)
    throw new Error(message)
  }

  warn(...args: any[]) {
    if (!this.#enableWarn) {
      return
    }
    console.warn('[WARN]', ...args)
  }

  /**
   * Typically called as a tagged template, so objects can be automatically printed in a useful way.
   * If called this way, objects should not be stringified-- they will be pretty printed automatically
   *
   * @example
   * logger.silly`Setting component data for entity ${entity} component ${component} to ${componentDataObj}`
   */
  silly(stringsOrMessage: TemplateStringsArray | string, ...values: any[]) {
    if (!this.#enableSilly) {
      return
    }

    const inBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'

    if (typeof stringsOrMessage === 'string') {
      if (inBrowser) {
        console.debug('[SILLY]', stringsOrMessage, ...values)
        return
      }

      console.debug('[SILLY]', stringsOrMessage)
      for (const val of values) {
        if (typeof val === 'object' && val !== null) {
          console.dir(val, { depth: null, colors: true })
        } else {
          console.debug(val)
        }
      }
      return
    }

    const strings = stringsOrMessage
    if (inBrowser) {
      // In the browser, keep objects intact as separate arguments so DevTools
      // renders them as live, interactive, expandable trees
      const parts: any[] = ['[SILLY]']
      let textBuffer = ''

      for (let i = 0; i < strings.length; i++) {
        textBuffer += strings[i]
        if (i < values.length) {
          const val = values[i]
          if (typeof val === 'object' && val !== null) {
            if (textBuffer) {
              parts.push(textBuffer)
              textBuffer = ''
            }
            parts.push(val)
          } else {
            textBuffer += String(val)
          }
        }
      }

      if (textBuffer) {
        parts.push(textBuffer)
      }

      console.debug(...parts)
      return
    }

    // In terminal runtimes (Bun / Node), console.debug truncates nested objects.
    // We print the header line and use console.dir for full-depth colored formatting.
    let header = ''
    const objects: any[] = []

    for (let i = 0; i < strings.length; i++) {
      header += strings[i]
      if (i < values.length) {
        const val = values[i]
        if (typeof val === 'object' && val !== null) {
          objects.push(val)
          const isAtEnd = i === strings.length - 2 && strings[strings.length - 1]?.trim() === ''
          if (!isAtEnd) {
            header += '[Object]'
          }
        } else {
          header += String(val)
        }
      }
    }

    console.debug(`[SILLY] ${header.trimEnd()}`)
    for (const obj of objects) {
      console.dir(obj, { depth: null, colors: true })
    }
  }
}
