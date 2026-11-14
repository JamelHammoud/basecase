import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { parseCase, touchTheDots } from './testing';
import { scaledToReach } from './scale';

const file = () => touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!);

describe('Case image declarations', () => {
  it('round-trips named colors, object points, mount tolerance and distractors', () => {
    const kase = file();
    const object = {
      ...kase.world.objects[0],
      colors: [{ name: 'ripe', color: '#ff0000' }],
      points: { handle: [1, 2, 3] },
    };
    const input = {
      ...kase,
      world: { objects: [object] },
      images: { cameraTolerance: { mm: 2, deg: 1 }, distractors: [{ ...object, id: 'distractor' }] },
    };

    expect(parseCase(input)).toMatchObject(input);
    expect(parseCase(kase)).not.toHaveProperty('images');
  });

  it.each([
    { colors: [{ name: 'ripe', color: 'red' }] },
    { colors: [{ name: '', color: '#ff0000' }] },
    {
      colors: [
        { name: 'ripe', color: '#ff0000' },
        { name: 'ripe', color: '#00ff00' },
      ],
    },
    { points: { handle: [1, Number.NaN, 3] } },
  ])('refuses malformed object declarations %j', (declaration) => {
    const kase = file();

    expect(() => parseCase({ ...kase, world: { objects: [{ ...kase.world.objects[0], ...declaration }] } })).toThrow();
  });

  it('refuses excessive tolerances and duplicate distractor ids', () => {
    const kase = file();

    expect(() => parseCase({ ...kase, images: { cameraTolerance: { mm: -1, deg: 0 } } })).toThrow();
    expect(() => parseCase({ ...kase, images: { distractors: [kase.world.objects[0]] } })).toThrow('repeats');
  });
});

it('scales local points, distractor poses and mount distances with the Case', () => {
  const base = file();
  const object = {
    ...base.world.objects[0],
    position: [20, 30, 40] as [number, number, number],
    points: { handle: [1, 2, 3] as [number, number, number] },
  };
  const input = {
    ...base,
    slot: { ...base.slot!, reachMm: 100, anchor: [0, 0, 0] as [number, number, number] },
    world: { objects: [object] },
    images: { cameraTolerance: { mm: 2, deg: 1 }, distractors: [{ ...object, id: 'leaf' }] },
  };
  const scaled = scaledToReach(input, 200, [0, 0, 0]);

  expect(scaled.world.objects[0].points).toEqual({ handle: [2, 4, 6] });
  expect(scaled.images?.distractors?.[0].position).toEqual([40, 60, 80]);
  expect(scaled.images?.distractors?.[0].points).toEqual({ handle: [2, 4, 6] });
  expect(scaled.images?.cameraTolerance).toEqual({ mm: 4, deg: 1 });
});
