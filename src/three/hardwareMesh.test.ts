import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HARDWARE_BY_TYPE, HardwareType, hardwareDimensions, makeSpec } from '../data/hardware';
import { buildHardwarePieces } from './hardwareMesh';

const mats = {
  main: new THREE.MeshStandardMaterial(),
  dark: new THREE.MeshStandardMaterial(),
  nylon: new THREE.MeshStandardMaterial(),
};

describe('buildHardwarePieces', () => {
  it('builds every type centred on its height', () => {
    for (const type of Object.keys(HARDWARE_BY_TYPE) as HardwareType[]) {
      const spec = makeSpec(type);
      const pieces = buildHardwarePieces(spec, mats);
      const box = new THREE.Box3();

      for (const p of pieces) {
        p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox!);
      }

      expect(pieces.length, type).toBeGreaterThan(0);
      expect(box.max.y + box.min.y, type).toBeCloseTo(0, 0);
      expect(box.max.y - box.min.y, type).toBeLessThanOrEqual(hardwareDimensions(spec).height + 0.01);
    }
  });

  it('cuts a dark recess into a screw head without edges', () => {
    const pieces = buildHardwarePieces(makeSpec('socket_head', { size: 'M3', length: 12, drive: 'torx' }), mats);
    const recess = pieces.filter((p) => p.material === mats.dark);

    expect(recess.length).toBeGreaterThan(0);
    expect(recess.every((p) => !p.edges)).toBe(true);
  });

  it('gives a lock nut its nylon ring', () => {
    const pieces = buildHardwarePieces(makeSpec('lock_nut', { size: 'M3' }), mats);

    expect(pieces.map((p) => p.material === mats.nylon)).toEqual([false, true]);
  });
});
