import { describe, expect, test } from 'bun:test'

import chunkArray from '@/utilities/chunkArray/chunkArray'

describe('chunkArray', () => {
  test('chunks an array into even pieces', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const size = 2
    const expected = [
      [1, 2],
      [3, 4],
      [5, 6],
    ]
    expect(chunkArray(input, size)).toEqual(expected)
  })

  test('chunks an array with a smaller last piece', () => {
    const input = [1, 2, 3, 4, 5]
    const size = 2
    const expected = [[1, 2], [3, 4], [5]]
    expect(chunkArray(input, size)).toEqual(expected)
  })

  test('returns an empty array when input is empty', () => {
    const input: number[] = []
    const size = 3
    const expected: number[][] = []
    expect(chunkArray(input, size)).toEqual(expected)
  })

  test('returns the whole array as one chunk if chunkSize >= array.length', () => {
    const input = [1, 2, 3]
    const size = 5
    const expected = [[1, 2, 3]]
    expect(chunkArray(input, size)).toEqual(expected)
  })

  test('returns chunks of size 1 when chunkSize is 1', () => {
    const input = [1, 2, 3]
    const size = 1
    const expected = [[1], [2], [3]]
    expect(chunkArray(input, size)).toEqual(expected)
  })

  test('handles different data types (strings)', () => {
    const input = ['a', 'b', 'c', 'd']
    const size = 3
    const expected = [['a', 'b', 'c'], ['d']]
    expect(chunkArray(input, size)).toEqual(expected)
  })

  test('handles an array of objects', () => {
    const input = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const size = 2
    const expected = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]]
    expect(chunkArray(input, size)).toEqual(expected)
  })

  test('throws or handles chunkSize <= 0', () => {
    const input = [1, 2, 3]
    expect(() => chunkArray(input, 0)).toThrow()
    expect(() => chunkArray(input, -1)).toThrow()
  })

  test('throws if chunkSize is not an integer', () => {
    const input = [1, 2, 3, 4]
    expect(() => chunkArray(input, 1.5)).toThrow()
  })

  test('throws if chunkSize exceeds MAX_SAFE_INTEGER', () => {
    const input = [1, 2, 3]
    expect(() => chunkArray(input, Number.MAX_SAFE_INTEGER + 1)).toThrow()
  })
})
