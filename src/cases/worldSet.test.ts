import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { parseCase, touchTheDots } from './testing';
import { readWorldChange, stagedChange, worldRefusal } from './worldSet';

const kase = () => JSON.parse(JSON.stringify(touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!)));

describe('movable world objects in the Case file', () => {
  it('reads the movable flag and refuses anything but true or false', () => {
    const file = kase();
    const objects = file.world.objects.map((o: object, i: number) => (i ? o : { ...o, movable: true }));

    expect(parseCase({ ...file, world: { objects } }).world.objects[0].movable).toBe(true);
    expect(() => parseCase({ ...file, world: { objects: [{ ...file.world.objects[0], movable: 'yes' }] } })).toThrow(
      'world.objects[0].movable must be true or false',
    );
  });
});

describe('a world change from code', () => {
  it('is read field by field, refusing NaN, Infinity and odd colors', () => {
    expect(readWorldChange({ name: 'lit', pose: { position: [1, 2, 3] }, color: '#FFAA00' })).toEqual({
      id: 'lit',
      pose: { position: [1, 2, 3] },
      color: '#ffaa00',
    });
    expect(readWorldChange({ name: 'lit', pose: { position: [Number.NaN, 0, 0] } })).toBeUndefined();
    expect(readWorldChange({ name: 'lit', pose: { rotation: [0, Infinity, 0] } })).toBeUndefined();
    expect(readWorldChange({ name: 'lit', pose: { position: [60_000, 0, 0] } })).toBeUndefined();
    expect(readWorldChange({ name: 'lit', color: 'red' })).toBeUndefined();
    expect(readWorldChange({ name: 'lit' })).toBeUndefined();
    expect(readWorldChange({ name: '../lit', visible: true })).toBeUndefined();
  });

  it('reaches only movable objects, and lands in the scaled world', () => {
    const world = {
      objects: [{ id: 'lit', movable: true }, { id: 'wall' }],
      place: (p: number[]) => p.map((x) => x * 2),
    };

    expect(worldRefusal(world.objects, 'wall')).toBe('wall isn’t movable');
    expect(worldRefusal(world.objects, 'link-1')).toBe('link-1 isn’t in the Case’s world');
    expect(stagedChange(world as never, { id: 'lit', pose: { position: [1, 2, 3] }, visible: false })).toEqual({
      id: 'lit',
      pose: { position: [2, 4, 6] },
      visible: false,
    });
    expect(stagedChange(world as never, { id: 'wall', visible: false })).toBe('wall isn’t movable');
  });
});
