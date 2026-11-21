import * as THREE from 'three';
import { expect, it } from 'vitest';
import { component, sceneOf } from './fixtures';
import { wiringNetlist } from './netlist';
import { analyzeWiring } from './routeAnalysis';
import { anchorFromWorld, editableNets, routeIdentity, routeStock, updateRoute } from './routeEditing';
import { buildBom } from '../utils/bom';

function fixture() {
  return sceneOf(
    [
      component('adapter', 'waveshare-bus-servo-adapter-a'),
      { ...component('servo', 'feetech-sts3215', 'c001'), position: [400, 0, 0] },
    ],
    [],
  );
}

it('edits exact existing connector identities and carries selected stock through analysis and purchasing', () => {
  const scene = fixture();
  const net = editableNets(scene)[0];
  const identity = routeIdentity(net)!;
  const original = structuredClone(scene);
  const project = updateRoute(scene, identity, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'adapter', position: [40, 80, 0] }],
  });
  const changed = { ...scene, project };
  const measured = analyzeWiring(changed, []);
  const cable = measured.buses[0].nets[0].route!;
  const bom = buildBom({ ...changed, wiring: measured, purchases: {}, measures: {} });

  expect(cable).toMatchObject({ status: 'pass', cableSupplyId: 'waveshare-servo-cable-5264-900' });
  expect(cable.points).toContainEqual([40, 80, 0]);
  expect(bom.lines.find((line) => line.key === 'supply:waveshare-servo-cable-5264-900')?.qty).toBe(1);
  expect(wiringNetlist(changed)).toEqual(wiringNetlist(scene));
  expect(scene).toEqual(original);
  expect(project.wiring?.[0]).toEqual({
    ...identity,
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'adapter', position: [40, 80, 0] }],
  });
  expect(routeStock(net).map((s) => s.id)).toContain('waveshare-servo-cable-5264-300');
  expect(routeStock(net).map((s) => s.id)).not.toContain('robot-cable-x3p');
});

it('refuses virtual endpoints, stale nets, incompatible stock, absent owners and nonfinite points', () => {
  const scene = fixture();
  const net = editableNets(scene)[0];
  const identity = routeIdentity(net)!;

  expect(routeIdentity({ ...net, from: { ...net.from, id: null } })).toBeNull();
  expect(routeIdentity({ ...net, to: { ...net.to, port: undefined } })).toBeNull();
  expect(() => updateRoute(scene, identity, { supplyId: 'robot-cable-x3p' })).toThrow();
  expect(() => updateRoute(scene, identity, { anchors: [{ partId: 'missing', position: [0, 0, 0] }] })).toThrow();
  expect(() => updateRoute(scene, identity, { anchors: [{ partId: 'adapter', position: [NaN, 0, 0] }] })).toThrow();
  expect(() => updateRoute({ ...scene, parts: scene.parts.slice(1) }, identity, {})).toThrow();
  expect(() => updateRoute(scene, { ...identity, to: { ...identity.to, port: 'other' } }, {})).toThrow();
});

it('stores millimeter coordinates in the owner frame after a rotated and posed canvas pick', () => {
  const owner = {
    ...component('owner', 'robotis-u2d2'),
    position: [20, 30, 40] as [number, number, number],
    rotation: [0, 0, 90] as [number, number, number],
    dimensions: { width: 60, height: 20, depth: 40 },
  };
  const delta = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const world = new THREE.Vector3(20, 40, 40).applyMatrix4(delta).toArray() as [number, number, number];
  const anchor = anchorFromWorld(owner, world, delta);

  expect(anchor.partId).toBe('owner');
  expect(anchor.position[0]).toBeCloseTo(10);
  expect(anchor.position[1]).toBeCloseTo(0);
  expect(anchor.position[2]).toBeCloseTo(0);
});

it('retains insufficient stock as a failure and replaces only the intended repeated-part route', () => {
  const scene = fixture();
  const another = { ...scene.parts[1], id: 'second', position: [800, 0, 0] as [number, number, number] };
  const input = { ...scene, parts: [...scene.parts, another] };
  const nets = editableNets(input);
  const first = updateRoute(input, routeIdentity(nets[0])!, { supplyId: 'waveshare-servo-cable-5264-300' });
  const second = updateRoute({ ...input, project: first }, routeIdentity(nets[1])!, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'second', position: [0, 70, 0] }],
  });
  const edited = updateRoute({ ...input, project: second }, routeIdentity(nets[0])!, {
    supplyId: 'waveshare-servo-cable-5264-900',
  });

  expect(analyzeWiring({ ...input, project: first }, []).buses[0].nets[0].route?.status).toBe('fail');
  expect(edited.wiring?.[1]).toBe(second.wiring?.[1]);
  expect(edited.wiring?.[0].anchors).toBeUndefined();
});

it('edits imported records independently of object property order and removes duplicate declarations', () => {
  const scene = fixture();
  const identity = routeIdentity(editableNets(scene)[0])!;
  const imported = {
    from: { port: identity.from.port, partId: identity.from.partId },
    to: { port: identity.to.port, partId: identity.to.partId },
    supplyId: 'waveshare-servo-cable-5264-300',
  };
  const input = {
    ...scene,
    project: { ...scene.project, wiring: [imported, { ...identity, supplyId: imported.supplyId }] },
  };
  const project = updateRoute(input, identity, { supplyId: 'waveshare-servo-cable-5264-900' });

  expect(project.wiring).toHaveLength(1);
  expect(analyzeWiring({ ...input, project }, []).buses[0].nets[0].route).toMatchObject({
    status: 'pass',
    cableSupplyId: 'waveshare-servo-cable-5264-900',
  });
});

it('keeps endpoints fixed even when a structural patch contains extra endpoint fields', () => {
  const scene = fixture();
  const identity = routeIdentity(editableNets(scene)[0])!;
  const patch = {
    supplyId: 'waveshare-servo-cable-5264-900',
    from: { partId: 'virtual', port: 'other' },
    to: { partId: 'missing', port: 'other' },
  };
  const project = updateRoute(scene, identity, patch);

  expect(project.wiring?.[0].from).toEqual(identity.from);
  expect(project.wiring?.[0].to).toEqual(identity.to);
});

it('keeps automatic and identical stock or point choices out of scene history', () => {
  const scene = fixture();
  const identity = routeIdentity(editableNets(scene)[0])!;

  expect(updateRoute(scene, identity, { supplyId: undefined })).toBe(scene.project);

  const project = updateRoute(scene, identity, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'adapter', position: [0, 80, 0] }],
  });
  const input = { ...scene, project };

  expect(updateRoute(input, identity, { supplyId: 'waveshare-servo-cable-5264-900' })).toBe(project);
  expect(updateRoute(input, identity, { anchors: [{ partId: 'adapter', position: [0, 80, 0] }] })).toBe(project);
});
