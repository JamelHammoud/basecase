import * as THREE from 'three';
import { expect, it } from 'vitest';
import { box } from '../../sim/fixtures/parts';
import { component, sceneOf } from '../../wiring/fixtures';
import { anchorFromWorld, editableNets, routeIdentity, updateRoute } from '../../wiring/routeEditing';
import { snapshotShapes } from './sceneShapes';
import { wiringIn } from './analysisPool';
import type { ScenePart } from '../../types/robotics';
import type { PortVec } from '../../types/ports';

function ownerMesh(part: ScenePart, geometry: THREE.BufferGeometry) {
  const mesh = new THREE.Mesh(geometry);

  mesh.position.set(...part.position);
  mesh.rotation.set(...(part.rotation.map(THREE.MathUtils.degToRad) as PortVec));
  mesh.scale.set(part.dimensions.width, part.dimensions.height, part.dimensions.depth);

  return snapshotShapes([{ id: part.id, object: mesh }]);
}

it('keeps exact surface picks, millimeter coordinates and conservative clearance through rotated owner resizing', async () => {
  const clip = { ...box('clip', [50, 40, 0], [20, 20, 10], 5), rotation: [0, 0, 90] as PortVec };
  const scene = sceneOf(
    [
      component('adapter', 'waveshare-bus-servo-adapter-a'),
      { ...component('servo', 'feetech-sts3215', 'c001'), position: [150, 0, 0] },
      clip,
    ],
    [],
  );
  const identity = routeIdentity(editableNets(scene)[0])!;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const pose = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const picked = new THREE.Vector3(40, 40, 0).applyMatrix4(pose).toArray() as PortVec;
  const anchor = anchorFromWorld(clip, picked, pose);

  expect(anchor.position[0]).toBeCloseTo(0, 12);
  expect(anchor.position[1]).toBeCloseTo(10, 12);
  expect(anchor.position[2]).toBeCloseTo(0, 12);

  const surface = updateRoute(scene, identity, { supplyId: 'waveshare-servo-cable-5264-900', anchors: [anchor] });
  const refused = await wiringIn(ownerMesh(clip, geometry), { ...scene, project: surface });

  expect(refused.buses[0].nets[0].route).toMatchObject({ status: 'unresolved', reason: 'Route blocked' });

  const outside = updateRoute({ ...scene, project: surface }, identity, {
    anchors: [{ partId: clip.id, position: [0, 20, 0] }],
  });
  const repaired = await wiringIn(ownerMesh(clip, geometry), { ...scene, project: outside });

  expect(repaired.buses[0].nets[0].route?.status).toBe('pass');
  expect(
    repaired.buses[0].nets[0].route?.points.some((point) => Math.hypot(point[0] - 30, point[1] - 40, point[2]) < 1e-9),
  ).toBe(true);

  const resized = { ...clip, dimensions: { width: 80, height: 40, depth: 16 } };
  const changed = { parts: scene.parts.map((part) => (part.id === clip.id ? resized : part)), project: outside };
  const afterResize = await wiringIn(ownerMesh(resized, geometry), changed);

  expect(changed.project.wiring?.[0].anchors?.[0].position).toEqual([0, 20, 0]);
  expect(afterResize.buses[0].nets[0].route).toMatchObject({ status: 'unresolved', reason: 'Route blocked' });

  const clear = updateRoute(changed, identity, { anchors: [{ partId: clip.id, position: [0, 30, 0] }] });
  const afterMove = await wiringIn(ownerMesh(resized, geometry), { ...changed, project: clear });

  expect(afterMove.buses[0].nets[0].route?.status).toBe('pass');
  expect(
    afterMove.buses[0].nets[0].route?.points.some((point) => Math.hypot(point[0] - 20, point[1] - 40, point[2]) < 1e-9),
  ).toBe(true);
  geometry.dispose();
});
