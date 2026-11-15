import * as THREE from 'three';
import { expect, it } from 'vitest';
import type { PortVec } from '../../types/ports';
import { component, sceneOf } from '../../wiring/fixtures';
import { fastenersIn, wiringIn } from './analysisPool';
import { snapshotShapes } from './sceneShapes';
import { bracket, objectsOf } from '../../assembly/assembly.fixtures';
import { fastenerInput } from '../../assembly/fastenerSpec';
import { jointsWithChains } from '../../assembly/rigJoints';
import { joint } from '../../sim/fixtures/parts';

it('measures cable routes against the actual transformed mesh bounds in the analysis worker', async () => {
  const adapter = component('adapter', 'robotis-u2d2');
  const servo = { ...component('servo', 'dynamixel-xl330-m288'), position: [70, 0, 0] as PortVec };
  const scene = sceneOf([adapter, servo], []);
  const clear = await wiringIn(snapshotShapes([]), scene);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(50, 40, 10));

  wall.position.set(40, 0, 0);
  wall.rotation.y = Math.PI / 2;

  const obstructed = await wiringIn(snapshotShapes([{ id: 'bracket', object: wall }]), scene);
  const original = clear.buses[0].nets[0].route!;
  const detour = obstructed.buses[0].nets[0].route!;

  expect(original.status).toBe('pass');
  expect(detour.points.length, JSON.stringify(detour)).toBeGreaterThan(original.points.length);
  expect(detour.requiredMm).toBeGreaterThan(original.requiredMm!);
  expect(detour.points).not.toEqual(original.points);
});

it('gives raw Build Along joints and engineering joints with fastener followers the same routes', async () => {
  const fasteners = bracket({ x: 200 });
  const adapter = { ...component('adapter', 'robotis-u2d2'), position: [0, 80, 0] as PortVec };
  const servo = { ...component('servo', 'dynamixel-xl330-m288'), position: [70, 80, 0] as PortVec };
  const parts = [adapter, servo, ...fasteners];
  const yaw = {
    ...joint({
      id: 'yaw',
      link: ['adapter', 'servo'],
      origin: [0, 80, 0],
      axis: [0, 1, 0],
      range: [-5, 5],
      effortNm: 1,
    }),
    child: ['servo', 'plate', 'boss'],
  };
  const raw = sceneOf(parts, [yaw]);
  const shapes = snapshotShapes(objectsOf(fasteners));
  const chains = await fastenersIn(shapes, fastenerInput(parts));
  const followed = jointsWithChains([yaw], parts, chains);

  expect(followed[0].child).toContain('screw-1');
  expect(followed[0].child).toContain('insert-1');
  expect(await wiringIn(shapes, sceneOf(parts, followed))).toEqual(await wiringIn(shapes, raw));
});
