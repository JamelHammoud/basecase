import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureObject } from './meshMeasure';

describe('measureObject', () => {
  it('measures a moved box exactly', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30));

    mesh.position.set(5, 10, -15);

    const m = measureObject(mesh);

    expect(m.volumeMm3).toBeCloseTo(6000);
    expect(m.areaMm2).toBeCloseTo(2 * (200 + 600 + 300));
    expect(m.min).toEqual([0, 0, -30]);
    expect(m.max).toEqual([10, 20, 0]);
    m.centroid.forEach((v, i) => expect(v).toBeCloseTo([5, 10, -15][i]));
    expect(m.triangles).toBe(12);
  });
});
