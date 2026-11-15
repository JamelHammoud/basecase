import { describe, expect, it } from 'vitest';
import { fastenerSteps } from './guideFastenerSteps';
import type { FastenerHome } from './guideOrder';

const home = (gate: string[]): FastenerHome => ({ module: 'main', atAttach: false, gate });

function scannedSteps(majors: string[], fasteners: string[], homes: Map<string, FastenerHome>) {
  const placed = new Set<string>();
  let pending = fasteners;
  const ready = majors.map((major) => {
    placed.add(major);

    const released = pending.filter((id) => homes.get(id)!.gate.every((gate) => placed.has(gate)));

    pending = pending.filter((id) => !released.includes(id));

    return released;
  });

  return { ready, pending };
}

describe('build guide fastener placement', () => {
  it('preserves source order, repeated gates, missing gates and first placement of repeated majors', () => {
    const majors = ['base', 'arm', 'base', 'lid'];
    const homes = new Map([
      ['bridge', home(['lid', 'base', 'lid'])],
      ['free', home([])],
      ['early', home(['base', 'base'])],
      ['outside', home(['other', 'base'])],
      ['middle', home(['arm', 'base'])],
    ]);
    const fasteners = ['bridge', 'free', 'early', 'outside', 'middle', 'early'];
    const before = structuredClone({ majors, homes, fasteners });
    const result = fastenerSteps(majors, fasteners, homes);

    expect(result).toEqual({
      ready: [['free', 'early', 'early'], ['middle'], [], ['bridge']],
      pending: ['outside'],
    });
    expect(result).toEqual(scannedSteps(majors, fasteners, homes));
    expect({ majors, homes, fasteners }).toEqual(before);
    expect(fastenerSteps([], fasteners, homes)).toEqual({ ready: [], pending: fasteners });
    expect(fastenerSteps(majors, [], homes)).toEqual({ ready: [[], [], [], []], pending: [] });

    homes.get('outside')!.gate = ['arm'];
    majors.reverse();

    expect(fastenerSteps(majors, fasteners, homes)).toEqual(scannedSteps(majors, fasteners, homes));
    expect(result.pending).toEqual(['outside']);
    expect(result.ready[0]).toEqual(['free', 'early', 'early']);
  });

  it('matches pending scans across seeded orders and gate sets without sharing result arrays', () => {
    let seed = 19;
    const next = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed % limit;
    };

    for (let trial = 0; trial < 200; trial++) {
      const majors = Array.from({ length: next(20) }, () => `part-${next(25)}`);
      const fasteners = Array.from({ length: next(60) }, (_, index) => `screw-${index}`);
      const homes = new Map(
        fasteners.map((id) => [id, home(Array.from({ length: next(5) }, () => `part-${next(25)}`))]),
      );
      const expected = scannedSteps(majors, fasteners, homes);
      const result = fastenerSteps(majors, fasteners, homes);

      expect(result).toEqual(expected);
      expect(fastenerSteps(majors, fasteners, homes)).toEqual(expected);

      result.ready.forEach((ids) => ids.push('changed'));
      result.pending.push('changed');

      expect(fastenerSteps(majors, fasteners, homes)).toEqual(expected);
    }
  });

  it.each([300, 600])('reads each gate once when %i fasteners wait for the final part', (count) => {
    const majors = Array.from({ length: count }, (_, index) => `part-${index}`);
    const fasteners = Array.from({ length: count }, (_, index) => `screw-${index}`);
    let reads = 0;
    const homes = new Map(
      fasteners.map((id) => [
        id,
        {
          module: 'main',
          atAttach: false,
          get gate() {
            reads++;

            return [majors.at(-1)!];
          },
        },
      ]),
    );
    const expected = scannedSteps(majors, fasteners, homes);

    expect(reads).toBe(count * count);

    reads = 0;

    expect(fastenerSteps(majors, fasteners, homes)).toEqual(expected);
    expect(reads).toBe(count);
  });
});
