import { describe, expect, mock, test, beforeEach, afterEach } from 'bun:test'

import { DefaultLogger } from '@/helpers/logger/logger'

describe('DefaultLogger', () => {
  let originalDebug: typeof console.debug
  let originalDir: typeof console.dir

  beforeEach(() => {
    originalDebug = console.debug
    originalDir = console.dir
  })

  afterEach(() => {
    console.debug = originalDebug
    console.dir = originalDir
  })

  test('silly does nothing when silly is disabled', () => {
    const mockDebug = mock(() => {})
    const mockDir = mock(() => {})
    console.debug = mockDebug as any
    console.dir = mockDir as any

    const logger = new DefaultLogger({ silly: false })
    logger.silly`Test message ${{ x: 1 }}`
    logger.silly('Plain message', { x: 1 })

    expect(mockDebug).not.toHaveBeenCalled()
    expect(mockDir).not.toHaveBeenCalled()
  })

  test('silly logs in terminal runtime using console.dir for objects', () => {
    const debugCalls: any[][] = []
    const dirCalls: any[][] = []
    console.debug = mock((...args: any[]) => {
      debugCalls.push(args)
    }) as any
    console.dir = mock((...args: any[]) => {
      dirCalls.push(args)
    }) as any

    const logger = new DefaultLogger({ silly: true })
    const data = { count: 42 }
    logger.silly`Entity 1 updated: ${data}`

    expect(debugCalls.length).toBe(1)
    expect(debugCalls[0]?.[0]).toBe('[SILLY] Entity 1 updated:')
    expect(dirCalls.length).toBe(1)
    expect(dirCalls[0]?.[0]).toEqual({ count: 42 })
    expect(dirCalls[0]?.[1]).toEqual({ depth: null, colors: true })
  })

  test('silly logs in browser simulation using console.debug for interactive objects', () => {
    const debugCalls: any[][] = []
    console.debug = mock((...args: any[]) => {
      debugCalls.push(args)
    }) as any

    // Simulate browser window & document
    const originalWindow = (globalThis as any).window
    const originalDocument = (globalThis as any).document
    ;(globalThis as any).window = { document: {} }
    ;(globalThis as any).document = (globalThis as any).window.document

    try {
      const logger = new DefaultLogger({ silly: true })
      const data = { count: 99 }
      logger.silly`Entity 2 updated: ${data}`

      expect(debugCalls.length).toBe(1)
      expect(debugCalls[0]?.[0]).toBe('[SILLY]')
      expect(debugCalls[0]?.[1]).toBe('Entity 2 updated: ')
      expect(debugCalls[0]?.[2]).toEqual({ count: 99 })
    } finally {
      ;(globalThis as any).window = originalWindow
      ;(globalThis as any).document = originalDocument
    }
  })

  test('setLevel enables and disables silly appropriately', () => {
    const logger = new DefaultLogger()
    const mockDebug = mock(() => {})
    console.debug = mockDebug as any

    logger.setLevel('silly')
    logger.silly('Test enabled')
    expect(mockDebug).toHaveBeenCalledTimes(1)

    mockDebug.mockClear()
    logger.setLevel('debug')
    logger.silly('Test disabled')
    expect(mockDebug).not.toHaveBeenCalled()
  })
})
