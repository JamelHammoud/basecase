import { describe, expect, it } from 'vitest';
import { plural } from '../../electron/plural.mjs';
import type { PartMass } from './engineeringTypes';
import { weightRow } from './engineeringWeight';
import { seededRandom } from './seededRandom';
import { lengthLabel } from './size';
import { weight } from './weight';

const all = { grams: 1234.5, com: [10, 123.45, -20] as [number, number, number] };
const mass = (id: string, grams: number, source: PartMass['source'] = 'estimate'): PartMass => ({
  id,
  grams,
  source,
  centroid: [0, 0, 0],
});
const body = (ids: string[]) => ({ parts: new Set(ids) });

function previous(masses: PartMass[], bodies: ReturnType<typeof body>[]) {
  const counted = masses.filter((m) => bodies.some((b) => b.parts.has(m.id)));
  const apart = masses.filter((m) => !counted.includes(m));
  const estimates = counted.filter((m) => m.source === 'estimate');
  const gramsOf = (values: PartMass[]) => values.reduce((sum, m) => sum + m.grams, 0);
  const estimated = estimates.length
    ? `. ${plural(estimates.length, 'part')} estimated from volume (${weight(gramsOf(estimates))})`
    : '';
  const leftOut = apart.length
    ? `. Leaves out ${plural(apart.length, 'part')} off the robot (${weight(gramsOf(apart))})`
    : '';

  return {
    check: 'Weight',
    status: estimates.length ? 'warn' : 'pass',
    detail: `${weight(all.grams)}, center of mass ${lengthLabel(all.com[1])} up${estimated}${leftOut}`,
    ids: estimates.map((m) => m.id),
  };
}

describe('robot weight reporting', () => {
  it('keeps estimate order, overlapping ownership and scenery totals', () => {
    const masses = [mass('b', 100), mass('scene', 1000), mass('a', 50), mass('known', 500, 'catalog')];
    const bodies = [body(['a', 'b']), body(['b', 'known', 'missing'])];

    expect(weightRow(all, masses, bodies)).toEqual({
      check: 'Weight',
      status: 'warn',
      detail:
        '1.24 kg, center of mass 123 mm up. 2 parts estimated from volume (150 g). Leaves out 1 part off the robot (1.00 kg)',
      ids: ['b', 'a'],
    });
    expect(weightRow(all, masses, bodies)).toEqual(previous(masses, bodies));
  });

  it('matches the previous report across generated bodies, sources and mass orders', () => {
    const random = seededRandom('64be21903f8426ab912c548a718cda07');
    const sources: PartMass['source'][] = [
      'catalog',
      'published',
      'printed',
      'sheet',
      'hardware',
      'supply',
      'estimate',
    ];

    for (let trial = 0; trial < 300; trial++) {
      const masses = Array.from({ length: trial % 41 }, (_, i) =>
        mass(String(i % 29), random() * 10000, sources[Math.floor(random() * sources.length)]),
      );
      const bodies = Array.from({ length: trial % 9 }, () =>
        body(masses.filter(() => random() < 0.3).map((m) => m.id)),
      );
      const saved = structuredClone({ masses, bodies });

      expect(weightRow(all, masses, bodies)).toEqual(previous(masses, bodies));
      expect({ masses, bodies }).toEqual(saved);
      masses.reverse();
      expect(weightRow(all, masses, bodies)).toEqual(previous(masses, bodies));
    }
  });

  it('reads current ownership and source edits and returns independent ids', () => {
    const masses = [mass('a', 1), mass('b', 2, 'printed')];
    const bodies = [body(['a'])];
    const first = weightRow(all, masses, bodies);

    bodies[0].parts.delete('a');
    bodies[0].parts.add('b');
    masses[1].source = 'estimate';
    masses[1].grams = 1234;

    const next = weightRow(all, masses, bodies);

    expect(next).toEqual(previous(masses, bodies));
    expect(next.ids).toEqual(['b']);
    expect(first.ids).toEqual(['a']);
    expect(next.ids).not.toBe(first.ids);
    expect(weightRow(all, [], [])).toEqual(previous([], []));
    expect(weightRow(all, masses, [])).toEqual(previous(masses, []));
  });

  it('preserves sum order, rounding and nonfinite formatting', () => {
    for (const grams of [0, -0, 0.049, 9.95, 999.5, Infinity, -Infinity, NaN]) {
      const masses = [mass('a', grams), mass('b', 0.1), mass('scene', grams), mass('other', 0.2)];
      const bodies = [body(['a', 'b'])];

      expect(weightRow(all, Object.freeze(masses), bodies)).toEqual(previous(masses, bodies));
    }
  });

  it.each([300, 600])('reads each mass id once across 20 bodies with %i masses', (size) => {
    let reads = 0;
    const masses = Array.from({ length: size }, (_, i) => ({
      ...mass(String(i), 1, 'catalog'),
      get id() {
        reads++;

        return String(i);
      },
    }));
    const bodies = Array.from({ length: 19 }, (_, i) => body([`unrelated-${i}`]));

    bodies.push(body(Array.from({ length: size }, (_, i) => String(i))));

    const expected = previous(masses, bodies);
    const before = reads;

    reads = 0;

    const actual = weightRow(all, masses, bodies);
    const after = reads;

    expect(actual).toEqual(expected);
    expect(before).toBe(size * 20);
    expect(after).toBe(size);
  });
});
