import * as THREE from 'three';
import { expect, it } from 'vitest';
import { labelMaterial } from './labelMaterials';

it('excludes invisible SimReady stand-ins and retains textured alpha cutouts and material sides', () => {
  const hidden = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const texture = new THREE.Texture();
  const original = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });

  texture.repeat.set(2, 3);

  const labelled = labelMaterial(3, original);

  expect(labelMaterial(1, hidden).visible).toBe(false);
  expect(labelled.uniforms.colorMap.value).toBe(texture);
  expect(labelled.uniforms.cutoff.value).toBeCloseTo(0.5);
  expect(labelled.uniforms.mapTransform.value).toBe(texture.matrix);
  expect(labelled.side).toBe(THREE.DoubleSide);
});
