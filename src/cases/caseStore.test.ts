import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { STORE_MAX_BYTES, storeRefusal, withCaseStore } from './caseStore';
import { readCases } from './schema';
import { parseCase, touchTheDots } from './testing';
import { readWorldChange } from './worldSet';

const kase = () => JSON.parse(JSON.stringify(touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!)));

describe('a Case’s store', () => {
  it('keeps plain JSON up to 64 KB in the Case file and refuses more', () => {
    const big = 'x'.repeat(STORE_MAX_BYTES);

    expect(parseCase({ ...kase(), store: { best: 12, names: ['ada'] } }).store).toEqual({ best: 12, names: ['ada'] });
    expect(() => parseCase({ ...kase(), store: big })).toThrow('store is over the 64 KB a Case keeps');
    expect(storeRefusal({ when: new Date() })).toBe('isn’t plain JSON');
    expect(storeRefusal({ n: Number.NaN })).toBe('isn’t plain JSON');
    expect(storeRefusal('x'.repeat(1024 * 1024))).toBe('is over the 64 KB a Case keeps');
    expect(storeRefusal('é'.repeat(STORE_MAX_BYTES / 2 + 1))).toBe('is over the 64 KB a Case keeps');
    expect(storeRefusal(Array.from({ length: 1000 }, (_, i) => ({ i, name: 'é'.repeat(20) })))).toBeNull();
  });

  it('sets and clears one Case’s store, leaving the others as they were', () => {
    const cases = [kase(), { ...kase(), id: 'other' }];
    const kept = withCaseStore(cases, cases[0].id, { best: 3 });

    expect(readCases(kept)[0].store).toEqual({ best: 3 });
    expect(kept[1]).toBe(cases[1]);
    expect(readCases(withCaseStore(kept, cases[0].id, null))[0].store).toBeUndefined();
  });
});

describe('movable world objects in the Case file', () => {
  it('reads the movable flag and refuses anything but true or false', () => {
    const file = kase();
    const objects = file.world.objects.map((o: object, i: number) => (i ? o : { ...o, movable: true }));

    expect(parseCase({ ...file, world: { objects } }).world.objects[0].movable).toBe(true);
    expect(() => parseCase({ ...file, world: { objects: [{ ...file.world.objects[0], movable: 'yes' }] } })).toThrow(
      'world.objects[0].movable must be true or false',
    );
  });

  it('reads a world change field by field and refuses NaN, Infinity and odd colors', () => {
    expect(readWorldChange({ name: 'lit', pose: { position: [1, 2, 3] }, color: '#FFAA00' })).toEqual({
      id: 'lit',
      pose: { position: [1, 2, 3] },
      color: '#ffaa00',
    });
    expect(readWorldChange({ name: 'lit', pose: { position: [Number.NaN, 0, 0] } })).toBeUndefined();
    expect(readWorldChange({ name: 'lit', pose: { rotation: [0, Infinity, 0] } })).toBeUndefined();
    expect(readWorldChange({ name: 'lit', color: 'red' })).toBeUndefined();
    expect(readWorldChange({ name: 'lit' })).toBeUndefined();
    expect(readWorldChange({ name: '../lit', visible: true })).toBeUndefined();
  });
});
