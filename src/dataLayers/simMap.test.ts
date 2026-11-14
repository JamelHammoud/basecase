import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { builderRobot } from '../cases/caseBuilder';
import type { GoalPlan } from '../cases/caseGoals';
import { fixtureRoom } from '../cases/roomFixture';
import { readRoomPlan } from '../cases/roomPlan';
import { roomWorld } from '../cases/roomWorld';
import { worldItem } from '../cases/schema';
import { caseRobot } from '../cases/testing';
import { SimEngine } from '../sim/engine';
import { withLidar } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { buildTryMap } from './mapJobs';
import { scanSources } from './simTracks';
import { simMap, type SimScans } from './simMap';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function roomTry(seconds: number, pitch = 0) {
  const source = withLidar(fixtureRobots().find((r) => r.id === 'rover-diff')!);
  const robot = {
    ...source,
    parts: source.parts.map((part) =>
      part.id === 'lidar' ? { ...part, rotation: [pitch, 0, 0] as [number, number, number] } : part,
    ),
  };
  const rig = buildRig(robot.joints, robot.parts);
  const room = readRoomPlan(JSON.stringify(fixtureRoom()), 'Kitchen.json');
  const plan = { objects: [] } as unknown as GoalPlan;
  const world = roomWorld(room)
    .objects(plan, builderRobot(rig, robot.parts), {} as never)
    .map(worldItem);
  const model = buildMjcf({ ...caseRobot(robot), rig, project: DEFAULT_PROJECT, world });
  const engine = new SimEngine(mj, model);
  const recorder = new Recorder(engine);

  engine.stepHook = recorder.hook;
  engine.step(seconds);

  const recording = recorder.finish();

  engine.dispose();

  return { recording, sources: scanSources(model, robot.parts) };
}

describe('a map from the sim’s LiDAR', () => {
  it('places repeated ranges again after the scanner moves', () => {
    const sim: SimScans = {
      recording: {
        frames: 3,
        dt: 0.05,
        t: Float32Array.from([0, 0.05, 0.1]),
        scan: Float32Array.from([0.5, 0.5, 0.5]),
        scanWidth: 1,
        nbody: 1,
        poses: Float32Array.from([0, 0, 1, 1, 0, 0, 0, 0.5, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0]),
      },
      sources: [
        {
          id: 'scan:lidar',
          name: 'LiDAR',
          owner: 'rover',
          body: 0,
          offset: 0,
          slot: 0,
          eye: {
            part: 'lidar',
            body: 'base',
            pos: [0, 0, 0],
            dirs: [1, 0, 0],
            rows: 1,
            cols: 1,
            rangeM: 2,
            scan: { rateHz: 10, fovDeg: 360 },
          },
        },
      ],
    };
    const built = simMap(sim)!;

    expect(Array.from(built.cloud.points)).toEqual([1, 0, 1, 2, 0, 1]);
    expect(built.placed.map((sweep) => sweep.at)).toEqual([0, expect.closeTo(0.1)]);
  });

  it('places a horizontal kitchen scan ring within 1 cm of level', () => {
    const cloud = buildTryMap({ sim: roomTry(0.5) })!;
    const z = Array.from({ length: cloud.points.length / 3 }, (_, i) => cloud.points[i * 3 + 2]);

    expect(cloud.frame).toBeNull();
    expect(z.length).toBeGreaterThan(100);
    expect(cloud.high - cloud.low).toBeLessThan(0.01);
    expect(cloud.low).toBeGreaterThan(0);
  });

  it('maps the simulated kitchen floor within 1 cm using a pitched LiDAR', () => {
    const sim = roomTry(0.5, 45);
    const cloud = buildTryMap({ sim })!;
    const floor = Array.from({ length: cloud.points.length / 3 }, (_, i) => i)
      .filter((i) => {
        const radius = Math.hypot(cloud.points[i * 3], cloud.points[i * 3 + 1]);

        return radius > 0.35 && radius < 0.8;
      })
      .map((i) => cloud.points[i * 3 + 2]);

    expect(floor.length).toBeGreaterThan(20);
    expect(Math.max(...floor.map(Math.abs))).toBeLessThan(0.01);
    expect(buildTryMap({ sim })!.points).toEqual(cloud.points);
  });
});
