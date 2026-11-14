import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { eulerToMatrix } from '../agent/agentFrame';
import { CASE_WORLDS } from '../cases/caseWorlds';
import type { GoalPlan } from '../cases/caseGoals';
import { worldItem } from '../cases/schema';
import { caseRobot } from '../cases/testing';
import { COMPONENTS } from '../data/components';
import { LIDAR_SCAN } from '../data/lidarScan';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { SimEngine } from './engine';
import { withLidar } from './fixtures/parts';
import { fixtureRobots } from './fixtures/robots';
import { lidarSpec, MAX_SCAN_RAYS, scanAngles } from './lidar';
import { buildMjcf } from './mjcf';
import { scanSummary } from './scanSummary';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const LIDARS = COMPONENTS.filter((c) => c.group === 'LiDAR');
const WALL_M = 2;

describe('reading a LiDAR from its spec rows', () => {
  for (const info of LIDARS) {
    it(info.id, () => {
      const spec = lidarSpec(info);

      expect(spec).not.toBeNull();
      expect(Number.isInteger(spec!.rays)).toBe(true);
      expect(spec!.rays).toBeGreaterThan(1);
      expect(spec!.rays).toBeLessThanOrEqual(MAX_SCAN_RAYS);
      expect(Number.isFinite(spec!.rangeM) && spec!.rangeM > 0).toBe(true);
      expect(spec!.rateHz).toBeGreaterThan(0);
      expect(spec!.fovDeg).toBeGreaterThan(0);
      expect(spec!.fovDeg).toBeLessThanOrEqual(360);
    });
  }

  it('takes samples per scan from the sample and scan rates, capped for budget', () => {
    const of = (id: string) => lidarSpec(COMPONENTS.find((c) => c.id === id)!);

    expect(of('slamtec-rplidar-c1')).toEqual({ rays: 500, rangeM: 12, rateHz: 10, fovDeg: 360 });
    expect(of('ldrobot-ld19')).toEqual({ rays: 450, rangeM: 12, rateHz: 10, fovDeg: 360 });
    expect(of('slamtec-rplidar-a1m8')).toMatchObject({ rays: MAX_SCAN_RAYS, rateHz: 5.5 });
    expect(of('hokuyo-ust-10lx')).toMatchObject({ rays: MAX_SCAN_RAYS, rangeM: 10, rateHz: 40, fovDeg: 270 });
    expect(of('ydlidar-x4-pro')).toMatchObject({ rays: 500, rateHz: 10 });
    expect(of('livox-mid-360')).toMatchObject({ rangeM: 40, fovDeg: 360 });
  });

  it('lays a full turn from behind, counter-clockwise, and a partial one edge to edge', () => {
    expect(scanAngles({ rays: 4, fovDeg: 360 })).toEqual([-180, -90, 0, 90]);
    expect(scanAngles({ rays: 3, fovDeg: 270 })).toEqual([-135, 0, 135]);
  });

  it('ignores parts that aren’t LiDARs', () => {
    expect(lidarSpec(COMPONENTS.find((c) => c.group === 'Cameras')!)).toBeNull();
  });
});

function corridorRover() {
  const robot = withLidar(fixtureRobots().find((r) => r.id === 'rover-diff')!);
  const lidar = robot.parts.find((p) => p.id === 'lidar')!;
  const origin = new THREE.Vector3(...LIDAR_SCAN[lidar.componentId!].origin)
    .applyMatrix4(eulerToMatrix(lidar.rotation))
    .add(new THREE.Vector3(...lidar.position));
  const plan = {
    route: { from: [0, 0, 0], to: [0, 0, 1500], halfWidth: origin.x + WALL_M * 1000 },
  } as unknown as GoalPlan;
  const corridor = CASE_WORLDS.find((w) => w.kind === 'corridor')!;
  const world = corridor.objects(plan, {} as never, {} as never).map(worldItem);
  const rig = buildRig(robot.joints, robot.parts);
  const model = buildMjcf({ ...caseRobot(robot), rig, project: DEFAULT_PROJECT, world });

  return { robot, model, origin, world };
}

function expectedRange(origin: THREE.Vector3, dir: THREE.Vector3, walls: ReturnType<typeof corridorRover>['world']) {
  const hits = walls.flatMap((w) => {
    const inner = w.position[0] - Math.sign(w.position[0]) * (w.dimensions.width / 2);
    const t = (inner - origin.x) / dir.x;
    const z = origin.z + dir.z * t;
    const reach = w.dimensions.depth / 2;

    return t > 0 && Math.abs(z - w.position[2]) <= reach ? [t / 1000] : [];
  });

  return hits.length ? Math.min(...hits) : null;
}

describe('an RPLIDAR C1 in a corridor', () => {
  it('reads each wall within 1 cm of the geometry, with the catalog’s ray count', () => {
    const { model, origin, world } = corridorRover();
    const engine = new SimEngine(mj, model);
    const scan = model.scans![0];

    expect(model.scans).toHaveLength(1);
    expect(model.bodies.find((b) => b.name === scan.body)?.parts).toContain('lidar');
    expect(engine.scanner!.tick()).toBe(true);
    expect(engine.scanner!.values).toHaveLength(500);

    let checked = 0;

    for (let i = 0; i < scan.cols; i++) {
      const [x, y, z] = scan.dirs.slice(i * 3, i * 3 + 3);
      const want = expectedRange(origin, new THREE.Vector3(x, z, -y), world);

      if (want === null || want > scan.rangeM) continue;

      expect(Math.abs(engine.scanner!.values[i] * scan.rangeM - want)).toBeLessThan(0.01);
      checked++;
    }

    expect(checked).toBeGreaterThan(100);

    const sideways = Array.from({ length: scan.cols }, (_, i) => scan.dirs[i * 3]);
    const left = sideways.indexOf(Math.max(...sideways));

    expect(engine.scanner!.values[left] * scan.rangeM).toBeCloseTo(WALL_M, 2);
    engine.dispose();
  });

  it('casts at the scan rate while the sim steps, and tells the agent what it sees', () => {
    const { model, robot } = corridorRover();
    const engine = new SimEngine(mj, model);

    engine.step(0.5);

    const versions = engine.scanner!.version;
    const scan = engine.scanner!.latest();

    expect(versions).toBeGreaterThanOrEqual(5);
    expect(versions).toBeLessThanOrEqual(6);
    expect(scan.points.length).toBeGreaterThan(0);
    expect(scan.points.length % 3).toBe(0);
    expect(scanSummary(model, scan, robot.parts)[0]).toMatch(
      /^Slamtec RPLIDAR C1: nearest return \d\.\d\d m, .*of 500 rays/,
    );
    engine.dispose();
  });
});
