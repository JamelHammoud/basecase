import { BoxGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { measureTriangles } from '../three/meshMeasure';
import { detectSheet } from './detectSheet';
import { plateTriangles, pocketTriangles } from './sheet.fixtures';

describe('sheet detection', () => {
  it('recovers a 3 mm plate with four through holes', () => {
    const profile = detectSheet(plateTriangles());

    expect(profile?.thicknessMm).toBeCloseTo(3, 5);
    expect(profile?.holes).toHaveLength(4);
    expect(profile?.outline).toEqual([
      [0, 0],
      [80, 0],
      [80, 60],
      [0, 60],
    ]);

    const centers = [
      [10, 10],
      [10, 50],
      [30, 50],
      [70, 10],
    ];

    profile!.holes.forEach((hole, i) => {
      const [cx, cy] = centers[i];

      hole.forEach(([x, y]) => expect(Math.abs(Math.hypot(x - cx, y - cy) - 2)).toBeLessThan(0.01));
    });
  });

  it('detects a 10 by 10 mm rectangle cut from 6.35 mm stock', () => {
    const geometry = new BoxGeometry(10, 10, 6.35).toNonIndexed();
    const triangles = (geometry.getAttribute('position').array as Float32Array).slice();

    geometry.dispose();

    const profile = detectSheet(triangles);

    expect(profile?.thicknessMm).toBeCloseTo(6.35, 5);
    expect(profile?.outline).toHaveLength(4);
    expect(profile?.holes).toEqual([]);
  });

  it('preserves a concave outline and holes after tilting the mesh', () => {
    const profile = detectSheet(plateTriangles({ concave: true, tilt: true }));

    expect(profile?.thicknessMm).toBeCloseTo(3, 4);
    expect(profile?.outline).toHaveLength(6);
    expect(profile?.holes).toHaveLength(4);
    expect(Math.abs(profile!.normal[2])).toBeLessThan(0.99);
  });

  it('detects tilted meshes after agent coordinates round to 0.001 mm', () => {
    const triangles = plateTriangles({ tilt: true });
    const rounded = Float32Array.from(triangles, (value) => Number(value.toFixed(3)));
    const profile = detectSheet(rounded);

    expect(profile?.thicknessMm).toBeCloseTo(3, 2);
    expect(profile?.holes).toHaveLength(4);
  });

  it('rejects matching caps without side walls', () => {
    const all = plateTriangles();
    const caps: number[] = [];

    for (let i = 0; i < all.length; i += 9) {
      const a = new Vector3().fromArray(all, i);
      const b = new Vector3().fromArray(all, i + 3);
      const c = new Vector3().fromArray(all, i + 6);

      if (a.z === b.z && b.z === c.z) caps.push(...all.slice(i, i + 9));
    }

    expect(detectSheet(Float32Array.from(caps))).toBeUndefined();
  });

  it('rejects pockets, open faces and nonfinite data', () => {
    const pocket = pocketTriangles();

    expect(measureTriangles(pocket).volumeMm3).toBeCloseTo(12800, 4);
    expect(detectSheet(pocket)).toBeUndefined();
    expect(detectSheet(plateTriangles().slice(0, 18))).toBeUndefined();
    expect(detectSheet(Float32Array.of(NaN, 0, 0))).toBeUndefined();
  });
});
