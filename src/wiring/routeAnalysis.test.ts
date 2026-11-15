import { describe, expect, it } from 'vitest';
import { joint } from '../sim/fixtures/parts';
import type { PortVec } from '../types/ports';
import { component, sceneOf } from './fixtures';
import { analyzeWiring, routeNetlist } from './routeAnalysis';
import { wiringNetlist } from './netlist';
import type { Net, WiringScene } from './connectors';

function fixture(moving = false): WiringScene {
  const adapter = { ...component('adapter', 'robotis-u2d2'), position: [0, 0, 0] as PortVec };
  const servo = { ...component('servo', 'dynamixel-xl330-m288'), position: [70, 0, 0] as PortVec };
  const elbow = joint({
    id: 'elbow',
    link: ['adapter', 'servo'],
    origin: [70, 0, 0],
    axis: [0, 0, 1],
    effortNm: 1,
    range: [-90, 90],
  });

  return sceneOf([adapter, servo], moving ? [elbow] : []);
}

const first = (scene: WiringScene) => analyzeWiring(scene, []).buses[0].nets[0].route!;

const customNet = (scene: WiringScene, net: Net) =>
  routeNetlist(scene, { buses: [], unmatched: [], power: { source: net.from, battery: false, nets: [net] } }, []).power
    .nets[0].route!;

describe('motion-aware wiring routes', () => {
  it('retains exact port identity, position and exit direction without changing bus order', () => {
    const scene = fixture();
    const net = wiringNetlist(scene).buses[0].nets[0];

    expect(net.from.port).toMatchObject({ name: 'bus-out', position: [24, 0, -2.8], axis: [1, 0, 0] });
    expect(net.to.port?.name).toBe('bus-in');
    expect(first(scene).status).toBe('pass');
    expect(first(scene).requiredMm).toBeGreaterThan(70);
  });

  it('bounds coupled shoulder and wrist motion and repeats exactly', () => {
    const scene = fixture(true);
    const wrist = joint({
      id: 'wrist',
      link: ['servo', 'tip'],
      origin: [90, 0, 0],
      axis: [0, 1, 0],
      effortNm: 1,
      range: [-30, 30],
      parentJoint: 'elbow',
    });
    const tip = { ...component('tip', 'dynamixel-xl330-m288'), position: [110, 0, 0] as PortVec };
    const coupled = {
      ...scene,
      parts: [...scene.parts, tip],
      project: { ...scene.project, joints: [...scene.project.joints!, wrist] },
    };
    const netlist = analyzeWiring(coupled, []);
    const route = netlist.buses[0].nets.at(-1)!.route!;

    expect(route.requiredMm).toBeGreaterThan(0);
    expect(Object.keys(route.limitingPose).sort()).toEqual(['elbow', 'wrist']);
    expect(analyzeWiring(coupled, [])).toEqual(netlist);
    expect(first(scene).requiredMm).toBeGreaterThan(first(fixture()).requiredMm!);
  });

  it('fails a 180 mm cable over a 300 mm route and retains the limiting joint pose', () => {
    const scene = fixture(true);

    scene.parts[1] = { ...scene.parts[1], position: [330, 0, 0] };

    const route = first(scene);

    expect(route.status).toBe('fail');
    expect(route.requiredMm).toBeGreaterThan(300);
    expect(route.lengthMm).toBe(180);
    expect(route.limitingPose.elbow).toBeDefined();
  });

  it('refuses missing port geometry, incompatible plugs and unbounded joint travel', () => {
    const scene = fixture();
    const net = wiringNetlist(scene).buses[0].nets[0];

    expect(customNet(scene, { ...net, to: { ...net.to, port: undefined } }).status).toBe('unresolved');
    expect(customNet(scene, { ...net, to: { ...net.to, connector: '5264-3' } }).status).not.toBe('pass');

    const continuous = fixture(true);

    continuous.project.joints = continuous.project.joints!.map((j) => ({ ...j, range: undefined }));
    expect(first(continuous)).toMatchObject({ status: 'unresolved', reason: 'Joint range unbounded' });
  });

  it('routes a power lead with the same exits and length machinery', () => {
    const scene = fixture();
    const net = wiringNetlist(scene).buses[0].nets[0];
    const power = customNet(scene, net);

    expect(power).toEqual(first(scene));
  });

  it('routes around bracket bounds and refuses a connector exit buried in a solid', () => {
    const scene = fixture();
    const obstacle = { id: 'bracket', min: [35, -20, -25] as PortVec, max: [45, 20, 25] as PortVec };
    const routed = analyzeWiring(scene, [obstacle]).buses[0].nets[0].route!;

    expect(routed.points.length).toBeGreaterThan(4);
    expect(routed.requiredMm).toBeGreaterThan(first(scene).requiredMm!);
    expect(analyzeWiring(scene, [{ ...obstacle, min: [20, -20, -25] }]).buses[0].nets[0].route?.status).toBe(
      'unresolved',
    );
  });
});

it('bounds the reach maximum between range samples', () => {
  const scene = fixture(true);

  scene.parts[0] = { ...scene.parts[0], position: [-100, -13, 0] };
  scene.parts[1] = { ...scene.parts[1], position: [100, 0, 0] };
  scene.project.joints = scene.project.joints!.map((j) => ({ ...j, origin: [0, 0, 0], range: [0, 15] }));

  const net = wiringNetlist(scene).buses[0].nets[0];
  const from = net.from.port!.position.map((v, i) => v + scene.parts[0].position[i]);
  const to = net.to.port!.position.map((v, i) => v + scene.parts[1].position[i]);
  const route = first(scene);

  for (let deg = 0; deg <= 15; deg += 0.25) {
    const radians = (deg * Math.PI) / 180;
    const x = to[0] * Math.cos(radians) - to[1] * Math.sin(radians);
    const y = to[0] * Math.sin(radians) + to[1] * Math.cos(radians);
    const separation = Math.hypot(x - from[0], y - from[1], to[2] - from[2]);

    expect(route.requiredMm).toBeGreaterThan(separation * 1.15);
  }
});

it('refuses huge finite joint ranges without generating an unbounded sample list', () => {
  const scene = fixture(true);

  scene.project.joints = scene.project.joints!.map((j) => ({ ...j, range: [-1e100, 1e100] }));
  expect(first(scene)).toMatchObject({ status: 'unresolved', reason: 'Range coverage exceeds routing limit' });
});

it('keeps Build Along points at the model sockets when the declared range excludes rest', () => {
  const scene = fixture(true);

  scene.project.joints = scene.project.joints!.map((j) => ({ ...j, range: [30, 60] }));

  const net = wiringNetlist(scene).buses[0].nets[0];
  const target = net.to.port!.position.map((v, i) => v + scene.parts[1].position[i]);

  expect(first(scene).points.at(-1)).toEqual(target);
});

it('places ordered routing anchors in their link frame and evaluates their motion', () => {
  const scene = fixture(true);
  const guide = {
    ...component('guide', 'dynamixel-xl330-m288'),
    position: [30, 100, 0] as PortVec,
    rotation: [0, 0, 90] as PortVec,
  };
  const net = wiringNetlist(scene).buses[0].nets[0];

  scene.parts.push(guide);
  scene.project.joints = scene.project.joints!.map((j) => ({ ...j, child: [...j.child, 'guide'] }));
  scene.project.wiring = [
    {
      from: { partId: 'adapter', port: net.from.port!.name },
      to: { partId: 'servo', port: net.to.port!.name },
      anchors: [{ partId: 'guide', position: [10, 0, 0] }],
    },
  ];

  const route = first(scene);

  expect(route.points[2][0]).toBeCloseTo(30, 10);
  expect(route.points[2].slice(1)).toEqual([110, 0]);
  expect(route.requiredMm).toBeGreaterThan(first(fixture(true)).requiredMm!);
  expect(route.limitingPose.elbow).toBeDefined();
});

it('keeps loop-driven fixed links unresolved instead of certifying only their driver samples', () => {
  const scene = fixture(true);
  const follower = { ...component('follower', 'dynamixel-xl330-m288'), position: [100, 0, 0] as PortVec };

  scene.parts.push(follower);
  scene.project.joints!.push({
    ...scene.project.joints![0],
    id: 'follower-joint',
    type: 'fixed',
    child: ['follower'],
    loop: { driver: 'elbow', link: 'rocker', fourBar: { ground: 20, crank: 10, coupler: 20, rocker: 10, theta: 0 } },
  });
  expect(first(scene)).toMatchObject({ status: 'unresolved', reason: 'Coupled linkage geometry unresolved' });
});
