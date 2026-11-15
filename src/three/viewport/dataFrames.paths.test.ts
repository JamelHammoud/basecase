import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFrame, tfTree, type FrameAnchors, type FrameTransform } from './dataFrames';

const edge = (parent: string, child: string, x = 1): FrameTransform => ({
  parent,
  child,
  stamp: 0,
  fixed: true,
  pose: { p: [x, 0, 0], q: [0, 0, 0, 1] },
});

const chain = (size: number) => tfTree(Array.from({ length: size }, (_, i) => edge(`frame-${i}`, `frame-${i + 1}`)));

const anchors = (links: FrameAnchors['links'] = new Map()): FrameAnchors => ({
  links,
  base: new THREE.Matrix4(),
});

afterEach(() => vi.restoreAllMocks());

describe('frame path accumulation', () => {
  it.each([300, 600])('stops at a nearby robot link in a %i-edge tree', (size) => {
    const tree = chain(size);
    const placed = anchors(
      new Map([
        ['frame-0', new THREE.Matrix4().makeTranslation(100, 0, 0)],
        [`frame-${size - 1}`, new THREE.Matrix4().makeTranslation(10, 0, 0)],
      ]),
    );
    const reads = vi.spyOn(tree.edges, 'get');
    const result = resolveFrame(tree, `frame-${size}`, 0, placed)!;

    expect(new THREE.Vector3().applyMatrix4(result).toArray()).toEqual([11, 0, 0]);
    expect(reads.mock.calls.length).toBeLessThanOrEqual(2);
    expect(placed.links.get(`frame-${size - 1}`)!.elements[12]).toBe(10);
  });

  it.each([300, 600])('keeps matrix copies constant along a %i-edge path to the base', (size) => {
    const tree = chain(size);
    const placed = anchors();
    const clones = vi.spyOn(THREE.Matrix4.prototype, 'clone');
    const result = resolveFrame(tree, `frame-${size}`, 0, placed)!;

    expect(new THREE.Vector3().applyMatrix4(result).toArray()).toEqual([size, 0, 0]);
    expect(clones.mock.calls.length).toBeLessThanOrEqual(3);
    expect(placed.base!.elements).toEqual(new THREE.Matrix4().elements);
  });

  it('places a sibling through a rotated anchor and resolves changed anchors afresh', () => {
    const anchor = edge('root', 'robot', 3);

    anchor.pose.q = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

    const tree = tfTree([anchor, edge('root', 'camera')]);
    const robot = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const placed = anchors(new Map([['robot', robot]]));
    const first = resolveFrame(tree, 'camera', 0, placed)!;

    robot.makeTranslation(20, 0, 0);

    const second = resolveFrame(tree, 'camera', 0, placed)!;

    expect(new THREE.Vector3().applyMatrix4(first).toArray()).toEqual([
      expect.closeTo(10, 10),
      expect.closeTo(2, 10),
      0,
    ]);
    expect(new THREE.Vector3().applyMatrix4(second).toArray()).toEqual([
      expect.closeTo(20, 10),
      expect.closeTo(2, 10),
      0,
    ]);
    expect(anchor.pose.p).toEqual([3, 0, 0]);
    expect(robot.elements[12]).toBe(20);
  });

  it('keeps the bounded traversal of a cyclic tree and stops at its first anchor', () => {
    const tree = tfTree([edge('a', 'b'), edge('b', 'a', 2)]);
    const unanchored = resolveFrame(tree, 'a', 0, anchors())!;
    const anchored = resolveFrame(tree, 'b', 0, anchors(new Map([['a', new THREE.Matrix4()]])))!;

    expect(new THREE.Vector3().applyMatrix4(unanchored).toArray()).toEqual([5, 0, 0]);
    expect(new THREE.Vector3().applyMatrix4(anchored).toArray()).toEqual([1, 0, 0]);
  });
});
