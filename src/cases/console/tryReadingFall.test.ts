import loadMujoco from '@mujoco/mujoco';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SimEngine } from '../../sim/engine';
import { fixtureMeasures, fixtureTriangles } from '../../sim/fixtures/parts';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildMjcf } from '../../sim/mjcf';
import type { SimModel } from '../../sim/mjcfTypes';
import { Recorder, type Recording } from '../../sim/recorder';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { buildCase, builderRobot } from '../caseBuilder';
import { traceJudge } from '../goalJudge';
import { worldItem, type Case } from '../schema';
import { trySignals } from '../tries';
import { tripFrames, type Trip } from '../tripFrames';
import { caseScoring, consoleTrack } from './consoleTrack';
import { DEFAULT_CONSOLE } from './layout';
import type { RecordedTrack } from './recordedSignals';
import { tryReading } from './tryReading';

const SECONDS = 4;
const FALL_AT_S = 2;
const FALL_DEG_PER_S = 180;
const TILT_BAR_DEG = 45;

const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
const rig = buildRig(robot.joints, robot.parts);

function walkCase(): Case {
  const built = buildCase({ goal: 'walk', world: 'floor' }, builderRobot(rig, robot.parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

function tiled(still: Recording, frames: number): Recording {
  const repeat = <T extends Float32Array | Float64Array>(a: T): T => {
    const out = new (a.constructor as new (n: number) => T)(a.length * frames);

    for (let n = 0; n < frames; n++) out.set(a, n * a.length);

    return out;
  };

  return {
    ...still,
    frames,
    t: Float32Array.from({ length: frames }, (_, n) => n * still.dt),
    ctrl: repeat(still.ctrl),
    qpos: repeat(still.qpos),
    qvel: new Float32Array(still.nv * frames),
    poses: repeat(still.poses),
    torque: new Float32Array(frames),
  };
}

function tip(pose: { at: Float64Array | Float32Array; o: number }, turn: THREE.Quaternion, pivot: THREE.Vector3) {
  const { at, o } = pose;
  const p = new THREE.Vector3(at[o], at[o + 1], at[o + 2]).sub(pivot).applyQuaternion(turn).add(pivot);
  const q = turn.clone().multiply(new THREE.Quaternion(at[o + 4], at[o + 5], at[o + 6], at[o + 3]));

  at.set([p.x, p.y, p.z, q.w, q.x, q.y, q.z], o);
}

function plantFall(r: Recording, model: SimModel): Recording {
  const [root] = r.root!;
  const pivot = new THREE.Vector3(r.qpos[root], r.qpos[root + 1], 0);
  const axis = new THREE.Vector3(1, 0, 0);

  for (let n = Math.round(FALL_AT_S / r.dt); n < r.frames; n++) {
    const degrees = Math.min(90, (n * r.dt - FALL_AT_S) * FALL_DEG_PER_S);
    const turn = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees));

    tip({ at: r.qpos, o: n * r.nq + root }, turn, pivot);
    model.bodies.forEach((b, i) => {
      if (b.parts?.length) tip({ at: r.poses, o: (n * r.nbody + i) * 7 }, turn, pivot);
    });
  }

  return r;
}

let fall: { track: RecordedTrack; trips: Trip[] };

beforeAll(async () => {
  const mj = await loadMujoco();
  const kase = walkCase();
  const model = buildMjcf({
    parts: robot.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    world: kase.world.objects.map(worldItem),
  });
  const engine = new SimEngine(mj, model);
  const still = new Recorder(engine).finish();

  engine.dispose();

  const recording = plantFall(tiled(still, Math.round(SECONDS / still.dt)), model);
  const parts = robot.parts;
  const { scoring, contract } = caseScoring({ kase, model, rig, parts });
  const trips = await tripFrames(contract, trySignals({ ...scoring, recording }));
  const track = await consoleTrack({
    ...{ kase, model, rig, parts, recording, efforts: null },
    ...{ caseConsole: DEFAULT_CONSOLE, cameras: [], judge: traceJudge },
  });

  fall = { track, trips };
}, 60000);

describe('read_try on a planted fall', () => {
  it('returns the fell label at its time, after robot.tilt crosses the bar', () => {
    const reading = tryReading(fall.track, fall.trips, { signals: ['robot.tilt'], every: 0.02, to: 3 });
    const fell = reading.failures.find((f) => f.label === 'fell')!;
    const tilt = reading.samples['robot.tilt'];
    const crossing = reading.samples.time[tilt.findIndex((v) => v !== null && v > TILT_BAR_DEG)]!;
    const before = tilt.filter((_, i) => reading.samples.time[i]! < FALL_AT_S);

    expect(fell).toBeDefined();
    expect(fell.time).toBeGreaterThan(FALL_AT_S);
    expect(fell.time).toBeLessThan(FALL_AT_S + 0.5);
    expect(reading.capture).toBe(fell.time);
    expect(Math.max(...before.map((v) => v ?? 0))).toBeLessThan(1);
    expect(crossing).toBeCloseTo(FALL_AT_S + TILT_BAR_DEG / FALL_DEG_PER_S, 1);
    expect(crossing).toBeLessThanOrEqual(fell.time);
    expect(fell.time - crossing).toBeLessThan(0.25);
  });
});
