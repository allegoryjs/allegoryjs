export interface LoggerChannelOpts {
  error: boolean
  warn: boolean
  info: boolean
  debug: boolean
}

export interface Logger {
  info: (...args: any[]) => void
  debug: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
}
