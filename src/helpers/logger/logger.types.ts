export interface LoggerChannelOpts {
  error: boolean
  warn: boolean
  info: boolean
  debug: boolean
  silly: boolean
}

export type LoggerLevels = 'error' | 'warn' | 'info' | 'debug' | 'silly' | 'silent'

export interface Logger {
  info: (...args: any[]) => void
  debug: (...args: any[]) => void
  error: (...args: any[]) => void
  errorAndThrow: (message: string) => never
  warn: (...args: any[]) => void
  silly: {
    (strings: TemplateStringsArray, ...values: any[]): void
    (message: string, ...args: any[]): void
  }
}
