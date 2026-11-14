import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { linkAnchor, resolveFrame, tfTree, type FrameAnchors, type FrameTransform } from './dataFrames';

const UPRIGHT = [1, 0, 0, 0];
const TURN_Z = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

const edge = (
  parent: string,
  child: string,
  p: [number, number, number],
  moving?: { stamp: number },
): FrameTransform => ({
  parent,
  child,
  stamp: moving?.stamp ?? 0,
  pose: { p, q: [0, 0, 0, 1] },
  fixed: !moving,
});

const at = (m: THREE.Matrix4 | null, local: [number, number, number] = [0, 0, 0]) =>
  new THREE.Vector3(...local)
    .applyMatrix4(m!)
    .toArray()
    .map((v) => Math.round(v * 1000) / 1000 || 0);

const anchors = (links: Record<string, THREE.Matrix4>, base: THREE.Matrix4 | null = null): FrameAnchors => ({
  links: new Map(Object.entries(links)),
  base,
});

describe('resolving a message frame to the robot', () => {
  it('maps ROS metres, Z up, onto the scene in millimetres, Y up', () => {
    expect(at(linkAnchor([1, 2, 3], UPRIGHT))).toEqual([1000, 3000, -2000]);
    expect(at(linkAnchor([0, 0, 0], TURN_Z), [1, 0, 0])).toEqual([0, 0, -1000]);
  });

  it('places a camera frame on its link through a static chain', () => {
    const tree = tfTree([
      edge('base_link', 'camera_link', [0.2, 0, 0.3]),
      edge('camera_link', 'camera_optical', [0, 0, 0.05]),
    ]);
    const links = anchors({ base_link: linkAnchor([1, 0, 0], TURN_Z) });

    expect(at(resolveFrame(tree, 'camera_optical', 0, links))).toEqual([1000, 350, -200]);
  });

  it('interpolates a moving chain at the asked time and holds a static one', () => {
    const tree = tfTree([
      edge('odom', 'base_link', [0, 0, 0], { stamp: 0 }),
      edge('odom', 'base_link', [2, 0, 0], { stamp: 2 }),
      edge('base_link', 'laser', [0.1, 0, 0.2]),
    ]);
    const world = anchors({}, linkAnchor([0, 0, 0], UPRIGHT));

    expect(at(resolveFrame(tree, 'laser', 0, world))).toEqual([100, 200, 0]);
    expect(at(resolveFrame(tree, 'laser', 1, world))).toEqual([1100, 200, 0]);
    expect(at(resolveFrame(tree, 'laser', 5, world))).toEqual([2100, 200, 0]);
  });

  it('anchors a root above the robot through a link below it', () => {
    const tree = tfTree([edge('odom', 'base_link', [3, 0, 0]), edge('base_link', 'laser', [0, 0, 0.2])]);
    const placed = anchors({ base_link: linkAnchor([0.5, 0, 0], UPRIGHT) });

    expect(at(resolveFrame(tree, 'odom', 0, placed))).toEqual([-2500, 0, 0]);
    expect(at(resolveFrame(tree, 'laser', 0, placed))).toEqual([500, 200, 0]);
  });

  it('skips a frame it can’t resolve', () => {
    const tree = tfTree([edge('base_link', 'laser', [0, 0, 0.2])]);

    expect(resolveFrame(tree, 'gripper_cam', 0, anchors({}, new THREE.Matrix4()))).toBeNull();
    expect(resolveFrame(tree, 'laser', 0, anchors({}))).toBeNull();
  });
});
