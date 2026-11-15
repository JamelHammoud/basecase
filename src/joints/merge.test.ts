import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type RobotJoint } from '../types/robotics';
import { withJoints } from './declare';
import { mergeJoints } from './merge';

const joint = (id: string, range?: [number, number]): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  range,
});

function countedJoints(count: number) {
  let reads = 0;
  const counted = (id: string) =>
    Object.defineProperty(joint(id), 'id', {
      get() {
        reads++;

        return id;
      },
    });
  const previous = Array.from({ length: count }, (_, i) => counted(`joint-${i}`));
  const made = Array.from({ length: count }, (_, i) => counted(`joint-${i * 2}`));

  return { previous, made, reads: () => reads };
}

describe('joint declaration batches', () => {
  it('retains old order and references, then appends every incoming joint in order', () => {
    const previous = [joint('a'), joint('b'), joint('a'), joint('c')];
    const made = [joint('b'), joint('new'), joint('b')];
    const before = structuredClone({ previous, made });
    const merged = mergeJoints(previous, made);

    expect(merged).toEqual([previous[0], previous[2], previous[3], ...made]);
    expect(merged[0]).toBe(previous[0]);
    expect(merged[3]).toBe(made[0]);
    expect(merged[5]).toBe(made[2]);
    expect({ previous, made }).toEqual(before);
  });

  it('matches ordered replacement across empty, duplicate and unusual ids', () => {
    const ids = ['', 'a', 'b', '__proto__', 'constructor'];

    for (let seed = 0; seed < 120; seed++) {
      const previous = Array.from({ length: seed % 13 }, (_, i) => joint(ids[(seed + i * 3) % ids.length]));
      const made = Array.from({ length: seed % 7 }, (_, i) => joint(ids[(seed * 7 + i) % ids.length]));

      for (const replace of [false, true]) {
        const expected = [
          ...(replace ? [] : previous.filter((old) => made.every((next) => old.id !== next.id))),
          ...made,
        ];
        const actual = mergeJoints(previous, made, replace);

        expect(actual).toEqual(expected);
        expect(actual).not.toBe(made);
        expect(actual).not.toBe(previous);
        actual.forEach((value, i) => expect(value).toBe(expected[i]));
      }
    }
  });

  it('keeps project settings and first ranges through merge, replacement and later edits', () => {
    const previous = [joint('a', [-10, 10]), joint('b', [-20, 20])];
    const project = { ...DEFAULT_PROJECT, joints: previous, firstRanges: { a: [-5, 5] as [number, number] } };
    const made = [joint('a', [-30, 30]), joint('new', [60, -40]), joint('new', [-90, 90])];
    const before = structuredClone({ project, made });

    for (const replace of [false, true]) {
      const result = withJoints(project, made, replace);

      expect(result.joints).toEqual(replace ? made : [previous[1], ...made]);
      expect(result.firstRanges).toEqual({ a: [-5, 5], new: [-40, 60] });
      expect(result.material).toBe(project.material);
    }

    expect({ project, made }).toEqual(before);
    expect(withJoints(project, []).joints).toEqual(previous);
    expect(withJoints(project, [], true).joints).toEqual([]);
    expect(withJoints(DEFAULT_PROJECT, made).joints).toEqual(made);
    expect(withJoints(project, [joint('b', [-50, 50])]).joints).toEqual([previous[0], joint('b', [-50, 50])]);
  });

  it.each([300, 600])('bounds id reads when updating %i scene joints', (count) => {
    const source = countedJoints(count);
    const merged = withJoints({ ...DEFAULT_PROJECT, joints: source.previous }, source.made);
    const reads = source.reads();

    expect(merged.joints).toHaveLength(count * 1.5);
    expect(reads).toBeLessThanOrEqual(count * 2);

    const baseline = countedJoints(count);

    baseline.previous.filter((old) => !baseline.made.some((next) => next.id === old.id));
    expect(baseline.reads()).toBe((count / 2) * (count / 2 + 1) + count * count);
  });

  it('reads no ids when replacing the complete batch', () => {
    const source = countedJoints(600);

    expect(mergeJoints(source.previous, source.made, true)).toHaveLength(600);
    expect(source.reads()).toBe(0);
  });

  it('reads no ids when either side is empty', () => {
    const source = countedJoints(600);

    expect(mergeJoints(source.previous, [])).toHaveLength(600);
    expect(mergeJoints([], source.made)).toHaveLength(600);
    expect(source.reads()).toBe(0);
  });
});
