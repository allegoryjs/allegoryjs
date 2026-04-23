import { describe, expect, test } from 'bun:test';
import deepFreeze from '../src/utilities/deepFreeze';

// ─── Primitives ─────────────────────────────────────────────────────

describe('primitives', () => {
  test('returns numbers as-is', () => {
    expect(deepFreeze(42)).toBe(42);
  });

  test('returns strings as-is', () => {
    expect(deepFreeze('hello')).toBe('hello');
  });

  test('returns booleans as-is', () => {
    expect(deepFreeze(true)).toBe(true);
  });

  test('returns null as-is', () => {
    expect(deepFreeze(null)).toBe(null);
  });

  test('returns undefined as-is', () => {
    expect(deepFreeze(undefined)).toBe(undefined);
  });
});

// ─── Plain objects ──────────────────────────────────────────────────

describe('plain objects', () => {
  test('returns a frozen clone', () => {
    const original = { a: 1, b: 'two' };
    const frozen = deepFreeze(original);
    expect(frozen).toEqual(original);
    expect(frozen).not.toBe(original);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('does not mutate the original', () => {
    const original = { x: 10 };
    deepFreeze(original);
    original.x = 20;
    expect(original.x).toBe(20);
  });

  test('deeply freezes nested objects', () => {
    const original = { a: { b: { c: 3 } } };
    const frozen = deepFreeze(original);
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
  });

  test('deeply clones nested objects', () => {
    const inner = { val: 99 };
    const original = { nested: inner };
    const frozen = deepFreeze(original);
    expect(frozen.nested).toEqual(inner);
    expect(frozen.nested).not.toBe(inner);
  });
});

// ─── Arrays ─────────────────────────────────────────────────────────

describe('arrays', () => {
  test('returns a frozen clone of an array that is still an Array instance', () => {
    const original = [1, 2, 3];
    const frozen = deepFreeze(original);
    expect(Array.isArray(frozen)).toBe(true);
    expect(frozen).toEqual([1, 2, 3]);
    expect(frozen).not.toBe(original);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('does not mutate the original array', () => {
    const original = [1, 2, 3];
    deepFreeze(original);
    original.push(4);
    expect(original).toEqual([1, 2, 3, 4]);
  });

  test('deeply freezes nested arrays', () => {
    const original = [[1, 2], [3, 4]];
    const frozen = deepFreeze(original);
    expect(Object.isFrozen(frozen[0])).toBe(true);
    expect(Object.isFrozen(frozen[1])).toBe(true);
  });

  test('deeply freezes objects inside arrays', () => {
    const original = [{ a: 1 }, { b: 2 }];
    const frozen = deepFreeze(original);
    expect(Object.isFrozen(frozen[0])).toBe(true);
    expect(frozen[0]).not.toBe(original[0]);
  });

  test('does not mutate nested objects in original array', () => {
    const inner = { a: 1 };
    const original = [inner];
    deepFreeze(original);
    inner.a = 999;
    expect(inner.a).toBe(999);
  });
});

// ─── Date ───────────────────────────────────────────────────────────

describe('Date', () => {
  test('clones and freezes a Date', () => {
    const original = new Date('2025-01-01');
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen.getTime()).toBe(original.getTime());
    expect(frozen instanceof Date).toBe(true);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('does not mutate the original Date', () => {
    const original = new Date('2025-06-15');
    const originalTime = original.getTime();
    deepFreeze(original);
    expect(original.getTime()).toBe(originalTime);
  });
});

// ─── RegExp ─────────────────────────────────────────────────────────

describe('RegExp', () => {
  test('clones and freezes a RegExp', () => {
    const original = /abc/gi;
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen.source).toBe('abc');
    expect(frozen.flags).toBe('gi');
    expect(frozen instanceof RegExp).toBe(true);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('preserves lastIndex', () => {
    const original = /x/g;
    original.lastIndex = 5;
    const frozen = deepFreeze(original);
    expect(frozen.lastIndex).toBe(5);
  });

  test('does not mutate the original RegExp', () => {
    const original = /abc/g;
    original.lastIndex = 2;
    deepFreeze(original);
    original.lastIndex = 10;
    expect(original.lastIndex).toBe(10);
  });
});

// ─── Map ────────────────────────────────────────────────────────────

describe('Map', () => {
  test('clones and freezes a Map', () => {
    const original = new Map([['a', 1], ['b', 2]]);
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen instanceof Map).toBe(true);
    expect(frozen.get('a')).toBe(1);
    expect(frozen.get('b')).toBe(2);
    expect(frozen.size).toBe(2);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('does not mutate the original Map', () => {
    const original = new Map([['a', 1]]);
    deepFreeze(original);
    original.set('b', 2);
    expect(original.size).toBe(2);
  });

  test('deeply freezes Map values', () => {
    const original = new Map([['key', { nested: true }]]);
    const frozen = deepFreeze(original);
    const val = frozen.get('key');
    expect(Object.isFrozen(val)).toBe(true);
    expect(val).not.toBe(original.get('key'));
  });

  test('deeply freezes Map keys that are objects', () => {
    const keyObj = { id: 1 };
    const original = new Map([[keyObj, 'value']]);
    const frozen = deepFreeze(original);
    // the cloned map should have a frozen clone of the key
    const frozenKeys = Array.from(frozen.keys());
    expect(frozenKeys[0]).not.toBe(keyObj);
    expect(Object.isFrozen(frozenKeys[0])).toBe(true);
  });

  test('does not mutate original Map values', () => {
    const inner = { count: 5 };
    const original = new Map([['k', inner]]);
    deepFreeze(original);
    inner.count = 100;
    expect(inner.count).toBe(100);
  });
});

// ─── Set ────────────────────────────────────────────────────────────

describe('Set', () => {
  test('clones and freezes a Set', () => {
    const original = new Set([1, 2, 3]);
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen instanceof Set).toBe(true);
    expect(frozen.size).toBe(3);
    expect(frozen.has(1)).toBe(true);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('does not mutate the original Set', () => {
    const original = new Set([1, 2]);
    deepFreeze(original);
    original.add(3);
    expect(original.size).toBe(3);
  });

  test('deeply freezes Set values that are objects', () => {
    const obj = { x: 1 };
    const original = new Set([obj]);
    const frozen = deepFreeze(original);
    const frozenValues = Array.from(frozen.values());
    expect(frozenValues[0]).not.toBe(obj);
    expect(Object.isFrozen(frozenValues[0])).toBe(true);
  });

  test('does not mutate original Set object values', () => {
    const obj = { x: 1 };
    const original = new Set([obj]);
    deepFreeze(original);
    obj.x = 999;
    expect(obj.x).toBe(999);
  });
});

// ─── ArrayBuffer ────────────────────────────────────────────────────

describe('ArrayBuffer', () => {
  test('clones and freezes an ArrayBuffer', () => {
    const original = new ArrayBuffer(8);
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen instanceof ArrayBuffer).toBe(true);
    expect(frozen.byteLength).toBe(8);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('does not mutate the original ArrayBuffer', () => {
    const original = new ArrayBuffer(4);
    const view = new DataView(original);
    view.setInt32(0, 42);
    deepFreeze(original);
    view.setInt32(0, 999);
    expect(view.getInt32(0)).toBe(999);
  });
});

// ─── TypedArrays ────────────────────────────────────────────────────

describe('TypedArrays', () => {
  test('clones a Uint8Array without throwing', () => {
    const original = new Uint8Array([10, 20, 30]);
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen instanceof Uint8Array).toBe(true);
    expect(frozen.length).toBe(3);
    expect(frozen[0]).toBe(10);
  });

  test('does not mutate the original Uint8Array', () => {
    const original = new Uint8Array([10, 20, 30]);
    deepFreeze(original);
    original[0] = 99;
    expect(original[0]).toBe(99);
  });

  test('clones a Float64Array without throwing', () => {
    const original = new Float64Array([1.1, 2.2]);
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen instanceof Float64Array).toBe(true);
    expect(frozen[0]).toBeCloseTo(1.1);
  });

  test('clones an Int32Array without throwing', () => {
    const original = new Int32Array([100, -200, 300]);
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen instanceof Int32Array).toBe(true);
    expect(Array.from(frozen)).toEqual([100, -200, 300]);
  });
});

// ─── DataView ───────────────────────────────────────────────────────

describe('DataView', () => {
  test('clones and freezes a DataView', () => {
    const buffer = new ArrayBuffer(16);
    const original = new DataView(buffer, 0, 8);
    const frozen = deepFreeze(original);
    expect(frozen).not.toBe(original);
    expect(frozen instanceof DataView).toBe(true);
    expect(frozen.byteLength).toBe(8);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('cloned DataView has independent buffer', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, 42);
    const frozen = deepFreeze(view);
    expect(frozen.getInt32(0)).toBe(42);
    // modifying original buffer should not affect frozen
    view.setInt32(0, 999);
    expect(frozen.getInt32(0)).toBe(42);
  });
});

// ─── Circular references ────────────────────────────────────────────

describe('circular references', () => {
  test('handles self-referencing objects', () => {
    const original: any = { name: 'loop' };
    original.self = original;
    const frozen = deepFreeze(original);
    expect(frozen.name).toBe('loop');
    expect(frozen.self).toBe(frozen); // same frozen ref
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('does not mutate self-referencing original', () => {
    const original: any = { name: 'loop' };
    original.self = original;
    deepFreeze(original);
    original.name = 'changed';
    expect(original.name).toBe('changed');
  });

  test('handles mutually referencing objects', () => {
    const a: any = { id: 'a' };
    const b: any = { id: 'b' };
    a.ref = b;
    b.ref = a;
    const frozen = deepFreeze(a);
    expect(frozen.id).toBe('a');
    expect(frozen.ref.id).toBe('b');
    expect(frozen.ref.ref).toBe(frozen);
    expect(Object.isFrozen(frozen.ref)).toBe(true);
  });
});

// ─── Mixed / complex structures ─────────────────────────────────────

describe('complex nested structures', () => {
  test('object with mixed nested types', () => {
    const original = {
      name: 'test',
      tags: new Set(['a', 'b']),
      metadata: new Map([['key', { deep: true }]]),
      coords: [1, 2, 3],
      created: new Date('2025-01-01'),
      pattern: /foo/i,
    };
    const frozen = deepFreeze(original);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.tags)).toBe(true);
    expect(Object.isFrozen(frozen.metadata)).toBe(true);
    expect(Object.isFrozen(frozen.coords)).toBe(true);
    expect(Object.isFrozen(frozen.created)).toBe(true);
    expect(Object.isFrozen(frozen.pattern)).toBe(true);

    expect(frozen.tags.has('a')).toBe(true);
    expect(frozen.metadata.get('key')).toEqual({ deep: true });
    expect(frozen.coords).toEqual([1, 2, 3]);
  });

  test('does not mutate original mixed structure', () => {
    const innerObj = { deep: true };
    const original = {
      tags: new Set(['a']),
      metadata: new Map([['key', innerObj]]),
      coords: [1, 2, 3],
    };
    deepFreeze(original);
    original.tags.add('z');
    innerObj.deep = false;
    original.coords.push(4);
    expect(original.tags.has('z')).toBe(true);
    expect(innerObj.deep).toBe(false);
    expect(original.coords).toEqual([1, 2, 3, 4]);
  });

  test('Map containing Sets containing objects', () => {
    const inner = { val: 42 };
    const original = new Map([['items', new Set([inner])]]);
    const frozen = deepFreeze(original);
    const frozenSet = frozen.get('items')!;
    expect(Object.isFrozen(frozenSet)).toBe(true);
    const frozenInner = Array.from(frozenSet.values())[0];
    expect(Object.isFrozen(frozenInner)).toBe(true);
    expect(frozenInner).not.toBe(inner);
    expect(frozenInner).toEqual({ val: 42 });
  });

  test('empty containers', () => {
    const frozen = deepFreeze({
      obj: {},
      arr: [],
      map: new Map(),
      set: new Set(),
    });
    expect(Object.isFrozen(frozen.obj)).toBe(true);
    expect(Object.isFrozen(frozen.arr)).toBe(true);
    expect(Object.isFrozen(frozen.map)).toBe(true);
    expect(Object.isFrozen(frozen.set)).toBe(true);
  });
});

// ─── Prototype preservation ─────────────────────────────────────────

describe('prototype preservation', () => {
  test('preserves custom class prototype', () => {
    class Vector {
      constructor(public x: number, public y: number) {}
      magnitude() { return Math.sqrt(this.x ** 2 + this.y ** 2); }
    }
    const original = new Vector(3, 4);
    const frozen = deepFreeze(original);
    expect(frozen instanceof Vector).toBe(true);
    expect(frozen.magnitude()).toBe(5);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen).not.toBe(original);
  });

  test('does not mutate original class instance', () => {
    class Point {
      constructor(public x: number, public y: number) {}
    }
    const original = new Point(1, 2);
    deepFreeze(original);
    original.x = 99;
    expect(original.x).toBe(99);
  });
});

// ─── Symbol keys ────────────────────────────────────────────────────

describe('symbol keys', () => {
  test('preserves symbol-keyed properties', () => {
    const sym = Symbol('test');
    const original = { [sym]: 'secret', visible: true };
    const frozen = deepFreeze(original);
    expect(frozen[sym]).toBe('secret');
    expect(frozen.visible).toBe(true);
    expect(Object.isFrozen(frozen)).toBe(true);
  });
});
