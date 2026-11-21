import * as THREE from 'three';
import { expect, it } from 'vitest';
import { box } from '../../sim/fixtures/parts';
import { framing } from '../viewport/cameraOps';
import { MAX_DIST } from '../viewport/types';
import { compositionCamera, compositionRoot, frameComposition } from './scene';
import { renderCompositionJob } from './render';
import { defaultComposition } from './settings';

it('fits large posed bounds beyond the CAD orbit limit without changing the source view', () => {
  const geometry = new THREE.BoxGeometry(200_000, 20_000, 40_000);
  const material = new THREE.MeshBasicMaterial();
  const root = new THREE.Group().add(new THREE.Mesh(geometry, material));
  const settings = { ...defaultComposition(), width: 64, height: 128 };
  const before = structuredClone(settings);
  const view = frameComposition(root, settings);
  const camera = compositionCamera({ ...settings, view });
  const bounds = new THREE.Box3().setFromObject(root);
  const direction = new THREE.Vector3(...view.position).sub(new THREE.Vector3(...view.target)).normalize();
  const cad = framing(camera, bounds, direction);

  expect(camera.position.distanceTo(new THREE.Vector3(...view.target))).toBeGreaterThan(MAX_DIST);
  expect(cad.position.distanceTo(cad.target)).toBeCloseTo(MAX_DIST, 6);
  expect(settings).toEqual(before);

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);

        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
        expect(Math.abs(projected.z)).toBeLessThan(1);
      }
    }
  }

  geometry.dispose();
  material.dispose();
});

it('refuses oversized output and damaged poses before creating WebGL resources', async () => {
  const snapshot = { parts: [box('arm', [0, 0, 0], [20, 40, 20], 10)], pose: {} };
  const settings = defaultComposition();

  await expect(renderCompositionJob({ snapshot, settings: { ...settings, width: 4097 }, meshes: {} })).rejects.toThrow(
    'Choose image sides',
  );
  await expect(
    renderCompositionJob({ snapshot: { ...snapshot, pose: { arm: [NaN] } }, settings, meshes: {} }),
  ).rejects.toThrow('Choose a finite pose');
});

it.each(['cad_part', 'mesh', 'boolean', 'component'] as const)(
  'refuses a %s with no prepared geometry instead of exporting an incomplete robot',
  (kind) => {
    const part = { ...box('missing', [0, 0, 0], [20, 40, 20], 10), kind };

    expect(() => compositionRoot({ parts: [box('base', [0, 0, 0], [20, 20, 20], 10), part], pose: {} })).toThrow(
      'Load every scene mesh before rendering.',
    );
  },
);
