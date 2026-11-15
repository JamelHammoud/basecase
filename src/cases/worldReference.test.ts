import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { scaledToReach } from './scale';
import { parseCase } from './schema';
import { touchTheDots } from './testing';

const hash = 'a'.repeat(64);
const original = () => touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!);

describe('imported Case references', () => {
  it('round-trips only a hash and a placement without embedding world geometry', () => {
    const kase = original();
    const imported = { hash, position: [100, 0, -200] };
    const loaded = parseCase({ ...kase, world: { ...kase.world, imported } });

    expect(loaded.world.imported).toEqual(imported);
    expect(JSON.stringify(loaded.world.imported).length).toBeLessThan(150);
    expect(parseCase(JSON.parse(JSON.stringify(loaded)))).toEqual(loaded);
  });

  it('refuses path hashes, non-finite placements and oversized placements', () => {
    const kase = original();
    const given = (imported: unknown) => ({ ...kase, world: { ...kase.world, imported } });

    for (const bad of ['', '../world', 'A'.repeat(64), 'a'.repeat(65)])
      expect(() => parseCase(given({ hash: bad, position: [0, 0, 0] }))).toThrow();

    for (const bad of [
      [NaN, 0, 0],
      [0, Infinity, 0],
      [0, 0],
      [0, 0, 1e10],
    ])
      expect(() => parseCase(given({ hash, position: bad }))).toThrow();
  });

  it('keeps an imported world at true size when entered by another robot', () => {
    const kase = original();
    const imported = { hash, position: [100, 0, -200] };
    const loaded = parseCase({ ...kase, world: { ...kase.world, imported } });

    expect(scaledToReach(loaded, 2000, [300, 0, 500])).toEqual(loaded);
  });
});
