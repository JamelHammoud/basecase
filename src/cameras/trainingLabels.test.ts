import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { decodeTrainingPixels, projectTrainingPoints, trainingInstances } from './trainingLabels';
import type { LensShot } from './lensRender';

const shot: LensShot = {
  position: [0, 0, 0],
  target: [0, 0, -1],
  up: [0, 1, 0],
  lens: { model: 'pinhole', hfovDeg: 90 },
};

describe('training labels', () => {
  it('assigns stable integer instance ids independent of scene ordering', () => {
    const items = [{ id: 'z-object' }, { id: 'a-part' }, { id: 'Z-object' }];
    const expected = [
      { id: 1, instance: 'Z-object' },
      { id: 2, instance: 'a-part' },
      { id: 3, instance: 'z-object' },
    ];

    expect(trainingInstances(items)).toEqual(expected);
    expect(trainingInstances([...items].reverse())).toEqual(expected);
  });
  it('decodes exact integer ids and millimeter radial depth with top-left row order', () => {
    const distances = new Uint8Array(16);
    const packedDepth = new DataView(distances.buffer);

    [256, 65536.5, 0, 384].forEach((value, index) => packedDepth.setFloat32(index * 4, value, false));

    const result = decodeTrainingPixels({
      width: 2,
      height: 2,
      ids: new Uint8Array([0, 0, 1, 255, 1, 2, 3, 255, 0, 0, 0, 255, 0, 1, 0, 255]),
      distances,
    });

    expect([...result.instanceIds]).toEqual([0, 256, 1, 66051]);
    expect([...result.depth]).toEqual([0, 384, 256, 65536.5]);
  });

  it('retains unlabelled floor depth while leaving the empty background at zero', () => {
    const distances = new Uint8Array(8);

    new DataView(distances.buffer).setFloat32(0, 1200, false);

    const result = decodeTrainingPixels({ width: 2, height: 1, ids: new Uint8Array(8), distances });

    expect([...result.instanceIds]).toEqual([0, 0]);
    expect([...result.depth]).toEqual([1200, 0]);
  });

  it('projects through the same lens and marks obscured and out-of-frame points invisible', () => {
    const depth = new Float32Array(100 * 100).fill(500);
    const points = [
      { instance: 'front', name: 'surface', position: [0, 0, -500] as [number, number, number] },
      { instance: 'back', name: 'hidden', position: [0, 0, -1000] as [number, number, number] },
      { instance: 'side', name: 'outside', position: [1000, 0, -500] as [number, number, number] },
      { instance: 'behind', name: 'behind', position: [0, 0, 100] as [number, number, number] },
    ];
    const result = projectTrainingPoints({ shot, width: 100, height: 100, depth, points });

    expect(result[0]).toMatchObject({ x: 50, y: 50, visible: true });
    expect(result.slice(1).map((point) => point.visible)).toEqual([false, false, false]);
  });

  it('applies instance pose deltas before projecting named points', () => {
    const result = projectTrainingPoints({
      shot,
      width: 100,
      height: 100,
      depth: new Float32Array(10000).fill(1000),
      points: [{ instance: 'moving', name: 'origin', position: [0, 0, -500] }],
      deltas: new Map([['moving', new THREE.Matrix4().makeTranslation(100, 0, 0)]]),
    });

    expect(result[0].x).toBeCloseTo(60);
    expect(result[0].y).toBeCloseTo(50);
    expect(result[0].visible).toBe(true);
  });

  it('uses equidistant fisheye projection for points behind the lens plane', () => {
    const result = projectTrainingPoints({
      shot: { ...shot, lens: { model: 'fisheye', fovDeg: 240 } },
      width: 100,
      height: 100,
      depth: new Float32Array(10000).fill(1000),
      points: [{ instance: 'wide', name: 'edge', position: [500, 0, 50] }],
    });

    expect(result[0].x).toBeGreaterThan(87);
    expect(result[0].x).toBeLessThan(91);
    expect(result[0].visible).toBe(true);
  });
});
