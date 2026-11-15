import { describe, expect, it } from 'vitest';
import { joint } from '../sim/fixtures/parts';
import type { PortVec } from '../types/ports';
import { component, rover, sceneOf } from './fixtures';
import { analyzeWiring, routeNetlist } from './routeAnalysis';
import type { Net, WiringScene } from './connectors';
import type { RouteObstacle } from './routeGeometry';
import { wiringRows } from './wiringChecks';
import { wiringSupplies } from './wiringSupplies';
import { wiringNetlist } from './netlist';

const net: Net = {
  from: {
    id: 'adapter',
    name: 'Adapter',
    connector: 'jst-eh-3',
    port: { name: 'out', kind: 'connector', position: [0, 0, 0], axis: [1, 0, 0], connector: 'jst-eh-3' },
  },
  to: {
    id: 'servo',
    name: 'Servo',
    connector: 'jst-eh-3',
    port: { name: 'in', kind: 'connector', position: [0, 0, 0], axis: [-1, 0, 0], connector: 'jst-eh-3' },
  },
};
const housing: RouteObstacle = { id: 'adapter', min: [-20, -10, -10], max: [0, 10, 10] };

function movingScene(range: [number, number], rigid: boolean): WiringScene {
  const adapter = component('adapter', 'robotis-u2d2');
  const servo = { ...component('servo', 'dynamixel-xl330-m288'), position: [68, 0, 0] as PortVec };
  const hinge = joint({
    id: 'hinge',
    link: ['base', 'servo'],
    origin: [-40, 0, 0],
    axis: [0, 0, 1],
    effortNm: 1,
    range,
  });

  return sceneOf([adapter, servo], [{ ...hinge, child: rigid ? ['adapter', 'servo'] : ['servo'] }]);
}

function routed(scene: WiringScene, obstacles: RouteObstacle[], connection = net) {
  return routeNetlist(
    scene,
    {
      buses: [],
      unmatched: [],
      power: { source: net.from, battery: false, nets: [connection] },
    },
    obstacles,
  ).power.nets[0].route!;
}

describe('relative cable clearance through moving housings', () => {
  it.each(['revolute', 'prismatic'] as const)(
    'keeps a rigid assembly requirement unchanged through %s motion',
    (type) => {
      const scene = movingScene([-15, 15], true);

      scene.project.joints = scene.project.joints!.map((j) => ({ ...j, type }));

      const rest = movingScene([0, 0], true);
      const before = routed(rest, [housing]);
      const after = routed(scene, [housing]);

      expect(before).toMatchObject({ status: 'pass', requiredMm: 86 });
      expect(after).toMatchObject({ status: 'pass', requiredMm: before.requiredMm, points: before.points });
    },
  );

  it('keeps a rigid detour attached to its moving housing', () => {
    const obstacle = { id: 'adapter', min: [25, -5, -5] as PortVec, max: [35, 5, 5] as PortVec };

    expect(routed(movingScene([-90, 90], true), [obstacle])).toMatchObject({
      status: 'pass',
      requiredMm: routed(movingScene([0, 0], true), [obstacle]).requiredMm,
    });
  });

  it('allows a moving connector to leave its own housing while its other endpoint stays fixed', () => {
    const movingHousing = { id: 'servo', min: [68, -10, -10] as PortVec, max: [88, 10, 10] as PortVec };
    const scene = movingScene([-15, 15], false);
    const route = routed(scene, [housing, movingHousing]);

    expect(route.status).toBe('pass');
    expect(route.requiredMm).toBeGreaterThan(routed(movingScene([0, 0], false), [housing, movingHousing]).requiredMm!);
    expect(route.limitingPose.hinge).toBeDefined();
  });

  it('still blocks a neighbouring solid crossing a moving connector exit', () => {
    const obstruction = { id: 'servo', min: [4, -1, -1] as PortVec, max: [6, 1, 1] as PortVec };

    expect(routed(movingScene([-15, 15], true), [housing, obstruction])).toMatchObject({
      status: 'unresolved',
      reason: 'Route blocked',
    });
  });
});

it.each(['battery', 'tether'] as const)(
  'lets a %s-powered build pass reach without measuring virtual endpoints',
  (source) => {
    const scene = rover();

    scene.project.joints = [];
    scene.parts = scene.parts.map((part, i) => ({ ...part, position: [i * 50, 0, 0] }));
    scene.parts = scene.parts.filter((part) => part.id !== 'buck' && (source === 'battery' || part.id !== 'pack'));

    const netlist = analyzeWiring(scene, []);
    const before = wiringSupplies(wiringNetlist(scene));
    const after = wiringSupplies(netlist);

    expect(netlist.power.source?.id).toBe(source === 'battery' ? 'pack' : null);
    expect(netlist.power.nets.length).toBeGreaterThan(0);
    expect(netlist.power.nets.every((item) => !item.route)).toBe(true);
    expect(netlist.buses[0].nets.every((item) => item.route?.status === 'pass')).toBe(true);
    expect(wiringRows(netlist)).toContainEqual(expect.objectContaining({ check: 'Cable reach', status: 'pass' }));
    expect(after.get('supply:xt60-pigtail')).toBe(before.get('supply:xt60-pigtail'));
    expect(after.get('supply:dc-barrel-pigtail')).toBe(before.get('supply:dc-barrel-pigtail'));
  },
);

it('keeps missing physical power port geometry unresolved', () => {
  expect(routed(movingScene([0, 0], false), [], { ...net, to: { ...net.to, port: undefined } })).toMatchObject({
    status: 'unresolved',
    reason: 'Port geometry missing',
  });
});

it('refuses a finite range beyond safe numeric precision', () => {
  const scene = movingScene([1e100, 1e100], true);

  expect(routed(scene, [])).toMatchObject({ status: 'unresolved', reason: 'Range coverage exceeds routing limit' });
});

it('routes an OpenRB-150 connector beyond its taller board bounds', () => {
  const adapter = component('adapter', 'robotis-openrb-150');
  const servo = { ...component('servo', 'dynamixel-xl330-m288'), position: [80, 0, 0] as PortVec };
  const scene = sceneOf([adapter, servo], []);
  const obstacles: RouteObstacle[] = [
    { id: 'adapter', min: [-33.445, -9.520000457763672, -12.7], max: [33.445, 9.520000457763672, 12.7] },
    { id: 'servo', min: [70, -14.5, -17], max: [90, 14.5, 17] },
  ];
  const netlist = analyzeWiring(scene, obstacles);
  const route = netlist.buses[0].nets[0].route!;

  expect(route.status).toBe('pass');
  expect(route.points[0]).toEqual([-29.3, 4.1, 0]);
  expect(route.points[1][1]).toBeCloseTo(obstacles[0].max[1] + 3, 10);
  expect(route.requiredMm).toBeGreaterThan(analyzeWiring(scene, []).buses[0].nets[0].route!.requiredMm!);
});
