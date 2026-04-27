import type { Logger } from '@/logger/logger.types'

export type EventMap = Record<string, unknown>

export interface DefaultEventMap {
  [key: string]: unknown
  narrate: string[]
}

export interface EngineEvent {
  type: string
  payload?: unknown
  timestamp?: number
  source?: string
  cancelable?: boolean
}

export interface EmitContext<P = unknown> {
  type: string
  payload: P
  timestamp: number
  cancelled: boolean

  cancel(): void
}

export interface SubscribeOptions {
  priority?: number
  once?: boolean
}

export type Listener<P = unknown> = (payload: P, ctx: EmitContext<P>) => void | Promise<void>

export interface ListenerEntry {
  callback: Listener<any>
  priority: number
  once: boolean
}

export interface EventBusConfig {
  maxListeners?: number
  enableBuffering?: boolean
  logger?: Logger
  onError?: (error: unknown, stream: string, listener: Listener<any>) => void
}

export type Disposer = () => void
