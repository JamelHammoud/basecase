import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFrame, tfTree, type FrameAnchors, type FrameTransform } from './dataFrames';

const edge = (parent: string, child: string): FrameTransform => ({
  parent,
  child,
  stamp: 0,
  fixed: true,
  pose: { p: [1, 0, 0], q: [0, 0, 0, 1] },
});

const anchors = (names: string[]) =>
  ({
    links: new Map(names.map((name, index) => [name, new THREE.Matrix4().makeTranslation(10 * (index + 1), 0, 0)])),
    base: null,
  }) satisfies FrameAnchors;

const x = (matrix: THREE.Matrix4 | null) => matrix?.elements[12];

afterEach(() => vi.restoreAllMocks());

describe('sibling frame anchor selection', () => {
  it('prefers the shallowest link and the first tree entry on ties', () => {
    const tree = tfTree([
      edge('branch', 'deep'),
      edge('root', 'branch'),
      edge('root', 'first'),
      edge('root', 'second'),
      edge('other', 'unrelated'),
    ]);
    const placed = anchors(['unrelated', 'second', 'first', 'deep']);
    const before = [...placed.links.values()].map((matrix) => matrix.elements.slice());

    expect(x(resolveFrame(tree, 'root', 0, placed))).toBe(29);
    expect([...placed.links.values()].map((matrix) => matrix.elements)).toEqual(before);

    placed.links.delete('first');

    expect(x(resolveFrame(tree, 'root', 0, placed))).toBe(19);

    placed.links.delete('second');

    expect(x(resolveFrame(tree, 'root', 0, placed))).toBe(38);
    expect(x(resolveFrame(tree, 'other', 0, placed))).toBe(9);
  });

  it('ignores bounded cyclic candidates in a disconnected tree', () => {
    const tree = tfTree([edge('b', 'a'), edge('a', 'b'), edge('root', 'robot')]);

    expect(x(resolveFrame(tree, 'root', 0, anchors(['a', 'b', 'robot'])))).toBe(29);
    expect(resolveFrame(tree, 'root', 0, anchors(['a', 'b']))).toBeNull();
  });

  it.each([300, 600])('walks each candidate chain once with %i sibling links', (size) => {
    const names = Array.from({ length: size }, (_, index) => `link-${index}`);
    const tree = tfTree(names.map((name) => edge('root', name)));
    const placed = anchors(names.toReversed());
    const reads = vi.spyOn(tree.edges, 'get');

    expect(x(resolveFrame(tree, 'root', 0, placed))).toBe(10 * size - 1);
    expect(reads.mock.calls).toHaveLength(2 * size + 3);
  });
});
