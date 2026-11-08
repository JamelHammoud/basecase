import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boundsOf } from './measurements';
import type { ViewportContext } from './viewportContext';

const RADIUS = 50;

function wheelContext(spin: number) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 20, 96).rotateX(Math.PI / 2));

  wheel.position.set(0, RADIUS, 0);
  wheel.rotation.z = spin;
  wheel.updateMatrixWorld(true);

  return { layer: { get: () => wheel } } as unknown as ViewportContext;
}

describe('boundsOf', () => {
  it('finds the true bottom of a wheel however far it has spun', () => {
    for (const spin of [0, Math.PI / 8, Math.PI / 4, 1]) {
      const bounds = boundsOf(wheelContext(spin), ['wheel']);

      expect(bounds!.min[1]).toBeCloseTo(0, 0);
      expect(bounds!.max[1]).toBeCloseTo(2 * RADIUS, 0);
    }
  });
});
