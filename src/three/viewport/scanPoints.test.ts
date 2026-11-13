import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ScanPoints } from './scanPoints';

const hits = (...values: number[]) => Float32Array.from(values);

describe('ScanPoints', () => {
  it('asks for a redraw only when the hits move or change in number', () => {
    const points = new ScanPoints(new THREE.Group());

    expect(points.set(hits(100, 20, 300, -40, 20, 310))).toBe(true);
    expect(points.set(hits(100.004, 20, 300, -40, 20, 310))).toBe(false);
    expect(points.set(hits(102, 20, 300, -40, 20, 310))).toBe(true);
    expect(points.set(hits(102, 20, 300))).toBe(true);
    expect(points.size).toBe(1);
  });

  it('clears once and then has nothing to redraw', () => {
    const points = new ScanPoints(new THREE.Group());

    points.set(hits(1, 2, 3));

    expect(points.set(null)).toBe(true);
    expect(points.set(null)).toBe(false);
    expect(points.size).toBe(0);
  });
});
