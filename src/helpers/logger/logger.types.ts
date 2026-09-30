export interface LoggerConfig {
  channelOpts?: LoggerChannelOpts
}

export interface LoggerChannelOpts {
  error?: boolean
  warn?: boolean
  info?: boolean
  debug?: boolean
  silly?: boolean
}

export type LoggerLevels = 'error' | 'warn' | 'info' | 'debug' | 'silly' | 'silent'

export abstract class Logger {
  constructor(protected config?: LoggerConfig) {}

  abstract info(...args: any[]): void
  abstract debug(...args: any[]): void
  abstract error(...args: any[]): void
  abstract errorAndThrow(message: string): never
  abstract warn(...args: any[]): void
  abstract silly(strings: TemplateStringsArray, ...values: any[]): void;
  abstract silly(message: string, ...args: any[]): void;
}
