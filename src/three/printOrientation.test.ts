import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { printReportOf } from './analysis/shapeReports';
import { ShapeSolid } from './analysis/shapeSolid';
import { bvhOf, checkPrintability, extraPose, extraPoses, type Vec3 } from './printability';

const trianglesOf = (geometry: THREE.BufferGeometry) =>
  (geometry.index ? geometry.toNonIndexed() : geometry).attributes.position.array as Float32Array;

function raisedTriangle(height: number, floor = false) {
  return new Float32Array([
    0,
    height,
    0,
    20,
    height,
    0,
    0,
    height,
    30,
    0,
    0,
    0,
    0,
    0,
    floor ? 30 : 0,
    floor ? 20 : 0,
    0,
    0,
  ]);
}

describe('print orientation costs', () => {
  it('keeps axis order and the exact contact area of each box face', () => {
    const tris = trianglesOf(new THREE.BoxGeometry(40, 20, 10));
    const saved = tris.slice();
    const shape = checkPrintability(tris)!;

    expect(shape.poses.map((pose) => pose.axis)).toEqual(['+x', '-x', '+y', '-y', '+z', '-z']);
    expect(shape.poses.map((pose) => pose.contactMm2)).toEqual([200, 200, 400, 400, 800, 800]);
    expect(shape.poses.map((pose) => [pose.overhangMm2, pose.supportMm3])).toEqual(
      Array.from({ length: 6 }, () => [0, 0]),
    );
    expect(tris).toEqual(saved);
  });

  it('measures support to a lower surface with the existing ray offset', () => {
    const tris = raisedTriangle(10, true);
    const pose = checkPrintability(tris)!.poses.find((candidate) => candidate.axis === '-y')!;

    expect(pose.overhangMm2).toBe(300);
    expect(pose.supportMm3).toBeCloseTo(300 * (10 - 0.001), 9);
    expect(pose.contactMm2).toBe(0);
  });

  it('measures support to the bed when the ray misses, ignoring a degenerate floor triangle', () => {
    const tris = raisedTriangle(10);
    const pose = extraPose(tris, bvhOf(tris), [0, -2, 0]);

    expect(pose.overhangMm2).toBe(300);
    expect(pose.supportMm3).toBe(3000);
    expect(pose.contactMm2).toBe(0);
    expect(pose.size).toEqual([20, 30, 10]);
    expect(pose.requested).toBe(true);
  });

  it.each([0.29, 0.31])('retains the 0.3 mm bed-contact boundary at %s mm', (height) => {
    const tris = raisedTriangle(height);
    const pose = extraPose(tris, bvhOf(tris), [0, -1, 0]);
    const contact = height < 0.3;

    expect(pose.contactMm2).toBe(contact ? 300 : 0);
    expect(pose.overhangMm2).toBe(contact ? 0 : 300);
    expect(pose.supportMm3).toBeCloseTo(contact ? 0 : 300 * height, 4);
  });

  it.each([29, 31, 44, 46])('retains the support and overhang angle limits at %s degrees', (degrees) => {
    const tris = raisedTriangle(10);

    tris[7] += 30 * Math.tan(THREE.MathUtils.degToRad(degrees));

    const pose = extraPose(tris, bvhOf(tris), [0, -1, 0]);
    const rise = tris[7] - 10;
    const area = 10 * Math.hypot(30, rise);

    expect(pose.overhangMm2).toBeCloseTo(degrees < 45 ? area : 0, 9);
    expect(pose.supportMm3).toBeCloseTo(degrees < 30 ? 300 * (10 + rise / 3) : 0, 9);
    expect(pose.contactMm2).toBe(0);
  });

  it('scores tilted flat-face candidates and manual faces identically', () => {
    const tris = trianglesOf(new THREE.BoxGeometry(40, 20, 10).rotateZ(0.3).translate(15, -20, 30));
    const bvh = bvhOf(tris);
    const saved = tris.slice();
    const shape = checkPrintability(tris, bvh)!;

    expect(shape.poses).toHaveLength(10);
    expect(shape.poses.filter((pose) => !pose.axis)).toHaveLength(4);

    for (const pose of shape.poses) {
      expect(extraPose(tris, bvh, pose.down)).toEqual({ ...pose, axis: undefined, requested: true });
    }

    expect(tris).toEqual(saved);
  });

  it('refuses an empty mesh and keeps degenerate-only costs at zero', () => {
    expect(checkPrintability(new Float32Array())).toBeNull();

    const shape = checkPrintability(new Float32Array(9))!;

    expect(shape.poses).toHaveLength(6);

    for (const pose of shape.poses) {
      expect([pose.contactMm2, pose.overhangMm2, pose.supportMm3]).toEqual([0, 0, 0]);
    }
  });
});

describe('print orientation batches', () => {
  it('batches uncached requested faces while retaining cache keys, first matches and request order', () => {
    const tris = trianglesOf(new THREE.BoxGeometry(40, 20, 10));
    const solid = new ShapeSolid(tris);
    const down: Vec3 = [1, 1, 0];
    const equivalent: Vec3 = [1.0000001, 1, 0];
    const other: Vec3 = [0, 1, 1];
    const first = printReportOf(solid, [down, other, equivalent]).check!;
    const requested = first.poses.slice(-3);

    expect(requested[0]).toEqual(extraPose(tris, solid.bvh, down));
    expect(requested[1]).toEqual(extraPose(tris, solid.bvh, other));
    expect(requested[2]).toBe(requested[0]);

    const cast = vi.spyOn(solid.bvh, 'raycastFirst');
    const reordered = printReportOf(solid, [other, equivalent, down]).check!.poses.slice(-3);

    expect(reordered).toEqual([requested[1], requested[0], requested[0]]);
    expect(reordered[0]).toBe(requested[1]);
    expect(reordered[1]).toBe(requested[0]);
    expect(cast).not.toHaveBeenCalled();
    cast.mockRestore();
    solid.dispose();
  });

  it('shares triangle reads across requested faces without retaining a triangle cache', () => {
    const tris = trianglesOf(new THREE.BoxGeometry(40, 20, 10, 5, 5, 5).rotateZ(0.3));
    const bvh = bvhOf(tris);
    const downs: Vec3[] = [
      [1, 2, 3],
      [-1, 0, 0],
      [0, 1, 0],
    ];
    let reads = 0;
    const watched = new Proxy(tris, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, target);
      },
    });
    const poses = extraPoses(watched, bvh, downs);

    expect(reads).toBeLessThanOrEqual(tris.length * (2 * downs.length + 1));
    expect(poses).toEqual(downs.map((down) => extraPose(tris, bvh, down)));

    reads = 0;
    expect(extraPoses(watched, bvh, [])).toEqual([]);
    expect(reads).toBe(0);
  });

  it.each([5, 10])('bounds triangle reads across ten candidates at %s mesh subdivisions', (segments) => {
    const tris = trianglesOf(new THREE.BoxGeometry(40, 20, 10, segments, segments, segments).rotateZ(0.3));
    const bvh = bvhOf(tris);
    let reads = 0;
    const watched = new Proxy(tris, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, target);
      },
    });
    const shape = checkPrintability(watched, bvh)!;

    expect(shape.poses).toHaveLength(10);
    expect(reads).toBeLessThanOrEqual(tris.length * (2 * shape.poses.length + 8));
  });
});
