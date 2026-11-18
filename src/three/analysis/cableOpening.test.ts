import * as THREE from 'three';
import { expect, it } from 'vitest';
import { component, sceneOf } from '../../wiring/fixtures';
import { wiringIn } from './analysisPool';
import { snapshotShapes } from './sceneShapes';

it('retains conservative refusal when a connector exit passes through a real opening inside the solid bounds', async () => {
  const ring = new THREE.Group();
  const bars = [
    { size: [12, 4, 40], at: [-0.5, 15, -0.3] },
    { size: [12, 4, 40], at: [27.5, 15, -0.3] },
    { size: [16, 4, 12], at: [13.5, 15, -14.3] },
    { size: [16, 4, 12], at: [13.5, 15, 13.7] },
  ];

  for (const bar of bars) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...(bar.size as [number, number, number])));

    mesh.position.set(...(bar.at as [number, number, number]));
    ring.add(mesh);
  }

  const shapes = snapshotShapes([{ id: 'ring', object: ring }]);
  const ray = new THREE.Raycaster(new THREE.Vector3(13.5, 5.3, -0.3), new THREE.Vector3(0, 1, 0), 0, 30);

  expect(ray.intersectObject(ring, true)).toHaveLength(0);

  const scene = sceneOf(
    [
      component('adapter', 'waveshare-bus-servo-adapter-a'),
      { ...component('servo', 'feetech-sts3215', 'c001'), position: [70, 0, 0] },
    ],
    [],
  );
  const result = await wiringIn(shapes, scene);

  expect(result.buses[0].nets[0].route).toMatchObject({ status: 'unresolved', reason: 'Route blocked' });
  ring.children.forEach((child) => (child as THREE.Mesh).geometry.dispose());
});
