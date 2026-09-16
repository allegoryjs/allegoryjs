import { describe, expect, it } from 'bun:test'

import schemer from '@/utilities/schemer'

describe('schemer utilities', () => {
  describe('isString', () => {
    it('identifies strings', () => {
      expect(schemer.isString('')).toBe(true)
      expect(schemer.isString('hello')).toBe(true)
      expect(schemer.isString(String('hello'))).toBe(true)
    })
    it('rejects non-strings', () => {
      expect(schemer.isString(123)).toBe(false)
      expect(schemer.isString(null)).toBe(false)
      expect(schemer.isString(undefined)).toBe(false)
      expect(schemer.isString({})).toBe(false)
      expect(schemer.isString([])).toBe(false)
    })
  })

  describe('isNumber', () => {
    it('identifies numbers', () => {
      expect(schemer.isNumber(0)).toBe(true)
      expect(schemer.isNumber(1)).toBe(true)
      expect(schemer.isNumber(-1.5)).toBe(true)
      expect(schemer.isNumber(NaN)).toBe(true)
      expect(schemer.isNumber(Infinity)).toBe(true)
    })
    it('rejects non-numbers', () => {
      expect(schemer.isNumber('123')).toBe(false)
      expect(schemer.isNumber(null)).toBe(false)
      expect(schemer.isNumber({})).toBe(false)
      expect(schemer.isNumber([])).toBe(false)
    })
  })

  describe('isInteger', () => {
    it('identifies integers', () => {
      expect(schemer.isInteger(0)).toBe(true)
      expect(schemer.isInteger(1)).toBe(true)
      expect(schemer.isInteger(-10)).toBe(true)
      expect(schemer.isInteger(Number.MAX_SAFE_INTEGER)).toBe(true)
      expect(schemer.isInteger(Number.MIN_SAFE_INTEGER)).toBe(true)
    })
    it('rejects non-integers', () => {
      expect(schemer.isInteger(1.5)).toBe(false)
      expect(schemer.isInteger(-1.5)).toBe(false)
      expect(schemer.isInteger(NaN)).toBe(false)
      expect(schemer.isInteger(Infinity)).toBe(false)
      expect(schemer.isInteger(-Infinity)).toBe(false)
      expect(schemer.isInteger('1')).toBe(false)
      expect(schemer.isInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
      expect(schemer.isInteger(Number.MIN_SAFE_INTEGER - 1)).toBe(false)
    })
  })

  describe('isBoolean', () => {
    it('identifies booleans', () => {
      expect(schemer.isBoolean(true)).toBe(true)
      expect(schemer.isBoolean(false)).toBe(true)
    })
    it('rejects non-booleans', () => {
      expect(schemer.isBoolean(0)).toBe(false)
      expect(schemer.isBoolean(1)).toBe(false)
      expect(schemer.isBoolean('')).toBe(false)
      expect(schemer.isBoolean(null)).toBe(false)
    })
  })

  describe('isNull', () => {
    it('identifies null', () => {
      expect(schemer.isNull(null)).toBe(true)
    })
    it('rejects non-null', () => {
      expect(schemer.isNull(undefined)).toBe(false)
      expect(schemer.isNull(false)).toBe(false)
      expect(schemer.isNull(0)).toBe(false)
      expect(schemer.isNull('')).toBe(false)
      expect(schemer.isNull({})).toBe(false)
    })
  })

  describe('isPositiveInteger', () => {
    it('identifies positive integers', () => {
      expect(schemer.isPositiveInteger(1)).toBe(true)
      expect(schemer.isPositiveInteger(100)).toBe(true)
      expect(schemer.isPositiveInteger(Number.MAX_SAFE_INTEGER)).toBe(true)
    })
    it('rejects non-positive integers', () => {
      expect(schemer.isPositiveInteger(0)).toBe(false)
      expect(schemer.isPositiveInteger(-1)).toBe(false)
      expect(schemer.isPositiveInteger(1.5)).toBe(false)
      expect(schemer.isPositiveInteger(NaN)).toBe(false)
    })
  })

  describe('isPojoArray', () => {
    it('identifies arrays of POJO values', () => {
      expect(schemer.isPojoArray([])).toBe(true)
      expect(schemer.isPojoArray([1, 2, 3])).toBe(true)
      expect(schemer.isPojoArray(['a', 'b'])).toBe(true)
      expect(schemer.isPojoArray([true, null, 1, 'str'])).toBe(true)
      expect(schemer.isPojoArray([{}, { a: 1 }])).toBe(true)
      expect(schemer.isPojoArray([[1], [2]])).toBe(true)
    })
    it('rejects non-arrays or arrays with non-POJO values', () => {
      expect(schemer.isPojoArray({})).toBe(false)
      expect(schemer.isPojoArray(null)).toBe(false)
      expect(schemer.isPojoArray([undefined])).toBe(false)
      expect(schemer.isPojoArray([() => {}])).toBe(false)
      expect(schemer.isPojoArray([Symbol('sym')])).toBe(false)
    })
  })

  describe('isPojoValue', () => {
    it('identifies valid POJO values', () => {
      expect(schemer.isPojoValue(1)).toBe(true)
      expect(schemer.isPojoValue('str')).toBe(true)
      expect(schemer.isPojoValue(true)).toBe(true)
      expect(schemer.isPojoValue(null)).toBe(true)
      expect(schemer.isPojoValue([])).toBe(true)
      expect(schemer.isPojoValue({})).toBe(true)
      expect(schemer.isPojoValue({ a: 1 })).toBe(true)
    })
    it('rejects invalid POJO values', () => {
      expect(schemer.isPojoValue(undefined)).toBe(false)
      expect(schemer.isPojoValue(() => {})).toBe(false)
      expect(schemer.isPojoValue(Symbol('sym'))).toBe(false)
    })
  })

  describe('isPojo', () => {
    it('correctly identifies when the argument is a POJO', () => {
      const pojo = {
        a: 1,
        b: 'str',
        c: false,
        d: null,
        e: [1],
        f: ['2'],
        g: [false],
        h: [null],
        i: {
          a: 1,
          b: 'str',
          c: false,
          d: null,
          e: [1],
          f: ['2'],
          g: [false],
          h: [null],
        },
        j: [
          {
            aa: 1,
            bb: '2',
            cc: false,
            dd: null,
            ee: [1],
            ff: ['2'],
            gg: [false],
            hh: [null],
          },
        ],
      }

      expect(schemer.isPojo(pojo)).toBe(true)
      expect(schemer.isPojo({})).toBe(true)
    })

    it('correctly identifies when the argument is not a POJO', () => {
      expect(schemer.isPojo(null)).toBe(false)
      expect(schemer.isPojo(undefined)).toBe(false)
      expect(schemer.isPojo(1)).toBe(false)
      expect(schemer.isPojo('str')).toBe(false)
      expect(schemer.isPojo(true)).toBe(false)

      // Objects with invalid values
      expect(schemer.isPojo({ a: undefined })).toBe(false)
      expect(schemer.isPojo({ b: () => {} })).toBe(false)
      expect(schemer.isPojo({ c: Symbol('sym') })).toBe(false)

      // Objects with symbol keys
      expect(schemer.isPojo({ [Symbol('sym')]: 123 })).toBe(false)
      // Note: JavaScript automatically converts numeric keys like `{ [1]: 123 }` to strings `{"1": 123}`, so they are valid POJOs.
    })

    it('rejects array as it is not a plain object', () => {
      // Arrays are objects but they are usually handled by isPojoArray in schemas
      expect(schemer.isPojo([])).toBe(false)
      expect(schemer.isPojo([1, 2])).toBe(false)
    })
  })
})
