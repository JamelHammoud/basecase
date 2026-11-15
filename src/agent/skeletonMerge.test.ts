import { describe, expect, it } from 'vitest';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import { buildSkeleton, type SkeletonJointInput } from './skeleton';

const joint = (id: string, x = 0): SkeletonJoint => ({ id, origin: [x, 0, 0], axis: [1, 0, 0] });
const skeleton = (joints: SkeletonJoint[]): RobotSkeleton => ({ frame: 'z-up', joints, pairs: [], massG: 100 });

function countedSkeleton(count: number) {
  let reads = 0;
  const previous = skeleton(
    Array.from({ length: count }, (_, i) =>
      Object.defineProperty(joint(`joint-${i}`, i), 'id', {
        get() {
          reads++;

          return `joint-${i}`;
        },
      }),
    ),
  );
  const made: SkeletonJointInput[] = Array.from({ length: count }, (_, i) => ({
    ...joint(`joint-${i * 2}`, i * 2 + 5),
    axis: [0, 2, 0],
  }));

  return { previous, made, reads: () => reads };
}

describe('skeleton declaration batches', () => {
  it('keeps first-match change detection, duplicate output order and existing metadata', () => {
    const previous = skeleton([joint('a', 1), joint('a', 100), joint('b', 2)]);
    const made: SkeletonJointInput[] = [joint('a', 4), { ...joint('a', 7), axis: [0, 2, 0] }, joint('new', 9)];
    const before = structuredClone({ previous, made });
    const result = buildSkeleton({ joints: made }, previous);

    expect(result.skeleton.joints).toEqual([previous.joints[2], made[0], { ...made[1], axis: [0, 1, 0] }, made[2]]);
    expect(result.skeleton.joints[0]).toBe(previous.joints[2]);
    expect([...result.moved]).toEqual([['a', [6, 0, 0]]]);
    expect(result.turned).toEqual(['a']);
    expect(result.skeleton.massG).toBe(100);
    expect(result.problems).toEqual([]);
    expect({ previous, made }).toEqual(before);
  });

  it('reports changes against prior joints even when replacing the whole skeleton', () => {
    const previous = skeleton([joint('a', 1), joint('b', 2)]);
    const result = buildSkeleton({ joints: [joint('a', 5)], replace: true }, previous);

    expect(result.skeleton.joints).toEqual([joint('a', 5)]);
    expect([...result.moved]).toEqual([['a', [4, 0, 0]]]);
    expect(buildSkeleton({ joints: [], replace: true }, previous).skeleton.joints).toEqual([]);
    expect(buildSkeleton({ joints: [] }, previous).skeleton.joints).toEqual(previous.joints);
    expect(buildSkeleton({ joints: [joint('a', 8)] }, result.skeleton).moved.get('a')).toEqual([3, 0, 0]);
    expect(buildSkeleton({ joints: [joint('a', 5)] }).moved.size).toBe(0);
  });

  it.each([300, 600])('bounds previous-id reads through merge and change reporting for %i joints', (count) => {
    const source = countedSkeleton(count);
    const result = buildSkeleton({ joints: source.made }, source.previous);
    const reads = source.reads();

    expect(reads).toBeLessThanOrEqual(count * 12);
    expect(result.skeleton.joints).toHaveLength(count * 1.5);
    expect(result.moved.size).toBe(count / 2);
    expect(result.turned).toHaveLength(count / 2);
    expect(result.problems).toEqual([]);
    expect([...result.moved.values()].every((v) => v[0] === 5 && v[1] === 0 && v[2] === 0)).toBe(true);
  });
});
