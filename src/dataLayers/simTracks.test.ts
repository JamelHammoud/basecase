import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { CASE_WORLDS } from '../cases/caseWorlds';
import type { GoalPlan } from '../cases/caseGoals';
import { worldItem } from '../cases/schema';
import { caseRobot } from '../cases/testing';
import { SimEngine } from '../sim/engine';
import { withLidar } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { liveScanPoints, recordedScanTrack, scanSources } from './simTracks';
import { spanAt } from './track';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const HALF_WIDTH_MM = 1200;

function corridorRover() {
  const robot = withLidar(fixtureRobots().find((r) => r.id === 'rover-diff')!);
  const plan = { route: { from: [0, 0, 0], to: [0, 0, 1500], halfWidth: HALF_WIDTH_MM } } as unknown as GoalPlan;
  const corridor = CASE_WORLDS.find((w) => w.kind === 'corridor')!;
  const world = corridor.objects(plan, {} as never, {} as never).map(worldItem);
  const rig = buildRig(robot.joints, robot.parts);
  const model = buildMjcf({ ...caseRobot(robot), rig, project: DEFAULT_PROJECT, world });
  const walls = world.filter((w) => Math.abs(w.position[0]) > 100);

  return { robot, model, walls };
}

const innerFaces = (walls: ReturnType<typeof corridorRover>['walls']) =>
  walls.map((w) => w.position[0] - Math.sign(w.position[0]) * (w.dimensions.width / 2));

function record(seconds: number) {
  const { robot, model, walls } = corridorRover();
  const engine = new SimEngine(mj, model);
  const recorder = new Recorder(engine);

  engine.stepHook = recorder.hook;
  engine.step(seconds);

  const live = engine.scanner!.latest();
  const recording = recorder.finish();

  engine.dispose();

  return { robot, model, walls, live, recording };
}

describe('a rover’s LiDAR in a try', () => {
  it('replays each recorded scan on the corridor walls, within 10 mm', () => {
    const { robot, model, walls, recording } = record(0.5);
    const [source] = scanSources(model, robot.parts);
    const track = recordedScanTrack(recording, source)!;
    const faces = innerFaces(walls);
    let checked = 0;

    expect(source.name).toBe(robot.parts.find((p) => p.id === 'lidar')!.name);
    expect(track.times.length).toBeGreaterThan(0);

    for (let i = 0; i < track.times.length; i++) {
      const { points } = track.message(i);

      for (let k = 0; k < points.length; k += 3) {
        const x = points[k];

        if (Math.abs(points[k + 2]) > 1000 || Math.abs(x) < HALF_WIDTH_MM / 2) continue;

        expect(Math.min(...faces.map((f) => Math.abs(x - f)))).toBeLessThan(10);
        checked++;
      }
    }

    expect(checked).toBeGreaterThan(200);
  });

  it('draws the scan the live sim drew at the playhead', () => {
    const { robot, model, recording, live } = record(0.5);
    const sources = scanSources(model, robot.parts);
    const track = recordedScanTrack(recording, sources[0])!;
    const end = recording.t[recording.frames - 1];
    const span = spanAt(track, end)!;
    const replayed = track.message(span.to).points;
    const [{ points: drawn }] = liveScanPoints(sources, live.points, live.counts);

    expect(track.times[span.to]).toBeLessThanOrEqual(end);
    expect(replayed).toHaveLength(drawn.length);

    for (let k = 0; k < drawn.length; k++) expect(Math.abs(replayed[k] - drawn[k])).toBeLessThan(10);
  });

  it('has nothing to replay from a try without a scan', () => {
    const { robot, model, recording } = record(0.1);
    const [source] = scanSources(model, robot.parts);

    expect(recordedScanTrack({ ...recording, scan: undefined, scanWidth: undefined }, source)).toBeNull();
  });
});
