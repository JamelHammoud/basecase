import { describe, expect, it } from 'vitest';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import { SkeletonTree } from './skeletonTree';

const joint = (id: string, fields: Partial<SkeletonJoint> = {}): SkeletonJoint => ({
  id,
  origin: [0, 0, 0],
  axis: [0, 0, 1],
  ...fields,
});
const skeleton = (joints: SkeletonJoint[]): RobotSkeleton => ({ frame: 'z-up', pairs: [], joints });

describe('skeleton tree', () => {
  it('keeps source order across branches and measures child origins and explicit tips', () => {
    const root = joint('root', { tip: [0, 0, 15] });
    const right = joint('right', { parent: 'root', origin: [3, 4, 0] });
    const leaf = joint('leaf', { parent: 'left', origin: [0, 12, 0] });
    const left = joint('left', { parent: 'root', origin: [0, 12, 0] });
    const other = joint('other');
    const tree = new SkeletonTree(skeleton([right, leaf, other, root, left]));

    expect(tree.childrenOf('root')).toEqual([right, left]);
    expect(tree.subtreeOf('root')).toEqual(['root', 'right', 'left', 'leaf']);
    expect(tree.subtreeOf('other')).toEqual(['other']);
    expect(tree.subtreeOf('missing')).toEqual(['missing']);
    expect(tree.linkEnds(root)).toEqual([right.origin, left.origin, root.tip]);
    expect(tree.linkLength(root)).toBe(15);
    expect(tree.linkLength(left)).toBe(0);
    expect(tree.linkLength(other)).toBe(0);
    expect(tree.byId.get('leaf')).toBe(leaf);
  });

  it('reads replaced joints and restored lists afresh without retaining an index across calls', () => {
    const root = joint('root');
    const child = joint('child', { parent: 'root', origin: [3, 4, 0] });
    const before = skeleton([root, child]);
    const moved = { ...child, parent: 'other', origin: [0, 0, 20] as [number, number, number] };
    const after = skeleton([root, moved, joint('other')]);

    expect(new SkeletonTree(before).linkLength(root)).toBe(5);
    expect(new SkeletonTree(after).childrenOf('root')).toEqual([]);
    expect(new SkeletonTree(after).byId.get('child')).toBe(moved);
    expect(new SkeletonTree(before).linkLength(root)).toBe(5);
    expect(before.joints).toEqual([root, child]);
  });

  it('visits each id once when a drag encounters a cycle or duplicate id', () => {
    const tree = new SkeletonTree(
      skeleton([
        joint('a', { parent: 'b' }),
        joint('b', { parent: 'a' }),
        joint('b', { parent: 'a' }),
        joint('c', { parent: 'missing' }),
      ]),
    );

    expect(tree.subtreeOf('a')).toEqual(['a', 'b']);
    expect(tree.subtreeOf('missing')).toEqual(['missing', 'c']);
  });
});
