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

it('loads and refreshes scene-carried connector geometry in the analysis worker', async () => {
  const adapter = { ...component('sourced-adapter', 'robotis-u2d2'), componentId: 'wiring-sourced-adapter' };
  const servo = { ...component('servo', 'dynamixel-xl330-m288'), position: [70, 0, 0] as PortVec };
  const scene = sceneOf([adapter, servo], [], {
    sourced: [
      {
        id: adapter.componentId,
        kind: 'part',
        name: 'Sourced bus adapter',
        maker: 'Fixture maker',
        mpn: 'BUS-1',
        spec: 'JST EH bus adapter',
        url: 'https://maker.example/bus-1',
        sources: [{ claim: 'Connector geometry', url: 'https://maker.example/bus-1.step' }],
        addedAt: '2026-11-14',
        link: { status: 'confirmed', checkedAt: '2026-11-14' },
        mesh: {
          size: [40, 20, 20],
          triangles: 12,
          source: 'manufacturer',
          cadUrl: 'https://maker.example/bus-1.step',
          license: 'Maker terms',
          ports: [
            {
              name: 'bus-out',
              kind: 'connector',
              role: 'bus-out',
              connector: 'jst-eh-3',
              position: [20, 0, 0],
              axis: [1, 0, 0],
            },
          ],
        },
      },
    ],
  });
  const netlist = await wiringIn(snapshotShapes([]), scene);

  expect(netlist.unmatched).toEqual([]);
  expect(netlist.buses[0]).toMatchObject({
    adapter: adapter.id,
    nets: [{ from: { id: adapter.id }, route: { status: 'pass' } }],
  });

  const record = scene.project.sourced![0];
  const changed = {
    ...scene,
    project: {
      ...scene.project,
      sourced: [
        {
          ...record,
          mesh: { ...record.mesh!, ports: [{ ...record.mesh!.ports[0], position: [0, 0, 0] as PortVec }] },
        },
      ],
    },
  };
  const refreshed = await wiringIn(snapshotShapes([]), changed);

  expect(refreshed.buses[0].nets[0].from.port?.position).toEqual([0, 0, 0]);
  expect(refreshed.buses[0].nets[0].route?.requiredMm).toBeGreaterThan(netlist.buses[0].nets[0].route!.requiredMm!);
});
