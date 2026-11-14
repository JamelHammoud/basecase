import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Take } from '../../electron/robot/robotTake.mjs';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import type { Recording } from './recorder';
import { openTake, takeEfforts, takeFrames, takeRecording } from './takeRecording';

const NaN32 = Number.NaN;

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
}, 60000);

function takeOf(joints: string[], parts: Partial<Take>): Take {
  const t = parts.t ?? new Float64Array(0);

  return {
    joints,
    frames: t.length,
    t,
    position: new Float32Array(0),
    velocity: null,
    effort: null,
    intentT: new Float64Array(0),
    intent: new Float32Array(0),
    twinT: new Float64Array(0),
    twin: new Float32Array(0),
    inputIds: [],
    inputT: new Float64Array(0),
    inputId: new Int32Array(0),
    inputLength: new Int32Array(0),
    input: new Float32Array(0),
    ...parts,
  };
}

function armEngine() {
  const engine = new SimEngine(mj, fixtureModel('arm-3dof'));
  const [a, b, c] = engine.sim.joints;

  return { engine, a, b, c, at: engine.jointAddresses(), qpos0: Float64Array.from(engine.model.qpos0) };
}

const sampleTake = (a: string, b: string) =>
  takeOf([b, a, 'ghost'], {
    t: Float64Array.from([10, 10.013, 10.05, 10.07]),
    position: Float32Array.from([0.1, NaN32, 9, 0.2, 0.3, 9, NaN32, 0.5, 9, 0.4, 0.6, 9]),
    effort: Float32Array.from([1, NaN32, 0, 2, NaN32, 0, 3, NaN32, 0, 4, NaN32, 0]),
    intentT: Float64Array.from([10.03]),
    intent: Float32Array.from([NaN32, 0.9, 0]),
  });

describe('takeRecording', () => {
  it('resamples a take at 50 Hz, holding each status and intent until the next', () => {
    const { engine, a, b, c, at, qpos0 } = armEngine();
    const scrub = takeRecording(engine, sampleTake(a.id, b.id))!;
    const r = scrub.recording;
    const q = (n: number, i: number) => r.qpos[n * r.nq + at[i]];
    const ctrl = (n: number, actuator: number) => r.ctrl[n * r.nu + actuator];

    expect(r.frames).toBe(4);
    expect(Array.from(r.t)).toEqual([0, 0.02, 0.04, 0.06].map(Math.fround));
    expect([0, 1, 2, 3].map((n) => q(n, 1))).toEqual([0.1, 0.2, 0.2, 0.2].map(Math.fround));
    expect([0, 1, 2, 3].map((n) => q(n, 0))).toEqual([0.3, 0.3, 0.3, 0.5].map(Math.fround));
    expect([0, 1, 2, 3].map((n) => q(n, 2))).toEqual([0, 1, 2, 3].map(() => qpos0[at[2]]));
    expect([0, 1, 2, 3].map((n) => ctrl(n, a.actuator))).toEqual([0.3, 0.3, 0.9, 0.9].map(Math.fround));
    expect([0, 1, 2, 3].map((n) => ctrl(n, b.actuator))).toEqual([0.1, 0.2, 0.2, 0.2].map(Math.fround));
    expect(ctrl(3, c.actuator)).toBeCloseTo(qpos0[at[2]]);
    expect(scrub.named).toEqual([true, true, false]);
    expect(Array.from(scrub.measured[1]!)).toEqual([1, 2, 2, 3]);
    expect(scrub.measured[0]).toBeNull();
    engine.dispose();
  });

  it('poses the robot as measured and leaves the engine as it found it', () => {
    const { engine, a, b } = armEngine();
    const before = Float64Array.from(engine.data.qpos);
    const scrub = takeRecording(engine, sampleTake(a.id, b.id))!;
    const r = scrub.recording;
    const pose = (n: number) => Array.from(r.poses.subarray(n * r.nbody * 7, (n + 1) * r.nbody * 7));

    expect(Array.from(engine.data.qpos)).toEqual(Array.from(before));
    expect(pose(0)).not.toEqual(pose(3));
    expect(pose(1)).toEqual(pose(2));
    engine.dispose();
  });

  it('prefers measured effort, falls back to the simulated one, and drops joints the take never read', () => {
    const { engine, a, b, c } = armEngine();
    const simulated = (_: SimEngine, r: Recording) => engine.sim.joints.map(() => new Float32Array(r.frames).fill(7));
    const { efforts } = openTake(engine, sampleTake(a.id, b.id), simulated)!;

    expect(Array.from(efforts[0])).toEqual([7, 7, 7, 7]);
    expect(Array.from(efforts[1])).toEqual([1, 2, 2, 3]);
    expect(efforts[2]).toHaveLength(0);

    const unread = takeOf([c.id], { t: Float64Array.from([0]), position: Float32Array.of(NaN32) });

    expect(openTake(engine, unread, simulated)).toBeNull();
    expect(takeEfforts(takeRecording(engine, sampleTake(a.id, b.id))!, () => [])[0]).toHaveLength(0);
    engine.dispose();
  });

  it('spreads a take longer than 10 minutes over 30,000 frames, so the timeline reaches its end', () => {
    const hour = takeOf(['a'], { t: Float64Array.from([5, 1805, 3605]) });
    const short = takeOf(['a'], { t: Float64Array.from([0, 60]) });

    expect(takeFrames(hour)).toEqual({ frames: 30_000, dt: 3600 / 29_999 });
    expect(takeFrames(short)).toEqual({ frames: 3001, dt: 0.02 });
  });
});
