import { describe, expect, it } from 'vitest';
import { Symbols } from './symbols';

describe('Routine symbol identities', () => {
  it('matches first-match interning with seeded, repeated and newly observed text', () => {
    const initial = ['', 'Maya', 'no', 'Maya', '__proto__'];
    const original = [...initial];
    const expected = [...initial];
    const symbols = new Symbols(initial);
    const decoded = symbols.list;
    const readings = ['Maya', '', 'yes', '__proto__', 'constructor', 'no', '🙂'];

    for (let tick = 0; tick < 1000; tick++) {
      const text = readings[tick % readings.length];
      let index = expected.indexOf(text);

      if (index < 0) {
        index = expected.length;
        expected.push(text);
      }

      expect(symbols.id(text)).toBe(index);
      expect(decoded[index]).toBe(text);
    }

    expect(decoded).toBe(symbols.list);
    expect(decoded).toEqual(expected);
    expect(initial).toEqual(original);
  });

  it('keeps compilation and independent runs isolated', () => {
    const compiled = new Symbols();

    expect(compiled.id('yes')).toBe(0);
    expect(compiled.id('no')).toBe(1);
    expect(compiled.id('yes')).toBe(0);

    const first = new Symbols(compiled.list);
    const second = new Symbols(compiled.list);

    expect(first.id('Maya')).toBe(2);
    expect(second.id('Ada')).toBe(2);
    expect(compiled.list).toEqual(['yes', 'no']);
    expect(first.list).toEqual(['yes', 'no', 'Maya']);
    expect(second.list).toEqual(['yes', 'no', 'Ada']);
  });
});
