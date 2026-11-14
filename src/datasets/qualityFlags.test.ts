import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { sceneModel } from './import/fixtures';
import { armReplay, fixtureArm } from './labelFixtures';
import { qualityFlags } from './qualityFlags';

const FPS = 50;
const D2R = Math.PI / 180;

const shoulder = (frame: number) => {
  const s = frame / FPS;

  if (s < 1) return 90 * s * D2R;

  if (s < 1.5) return 90 * D2R;

  return Math.max(0, 90 * (2.5 - s)) * D2R;
};

let mj: MainModule;
let model: SimModel;
let recording: Recording;

beforeAll(async () => {
  mj = await loadMujoco();
  model = sceneModel([fixtureArm()]);
  recording = armReplay(mj, model, { frames: 5 * FPS, fps: FPS, radians: (n, c) => (c ? 0 : shoulder(n)) });
});

const flagsOf = (r: Recording, modelMatches: boolean | null = true) =>
  qualityFlags({ recording: r, model, modelMatches });

const kinds = (r: Recording, kind: string) => flagsOf(r).filter((f) => f.kind === kind);

const copy = (r: Recording): Recording => ({ ...r, t: r.t.slice(), poses: r.poses.slice(), qpos: r.qpos.slice() });

describe('quality flags', () => {
  it('a limit hit is flagged, once per joint per stretch, at its first frame', () => {
    const limits = kinds(recording, 'joint-limit');

    expect(limits).toHaveLength(1);
    expect(limits[0].joint).toBe(model.joints[0].name);
    expect(limits[0].at).toBeGreaterThan(0.95);
    expect(limits[0].at).toBeLessThanOrEqual(1);
  });

  it('flags a robot that holds still for over 2 s, and not a 0.5 s pause', () => {
    const idle = kinds(recording, 'idle');

    expect(idle).toHaveLength(1);
    expect(idle[0].at).toBeCloseTo(2.5, 1);
  });

  it('flags a late frame and a blank row as frame gaps', () => {
    const gapped = copy(recording);
    const row = gapped.nbody * 7;

    for (let f = 100; f < gapped.frames; f++) gapped.t[f] += 0.5;

    gapped.poses.fill(NaN, 40 * row, 42 * row);

    const gaps = kinds(gapped, 'frame-gap');

    expect(gaps.map((g) => g.at)).toEqual([0.8, 1.98]);
    expect(kinds(recording, 'frame-gap')).toEqual([]);
  });

  it('flags effort only when the servo sits at its cap for 0.1 s', () => {
    const torque = new Float32Array(recording.frames).fill(0.4);

    torque.fill(1, 20, 30);
    torque.fill(1, 60, 63);

    const effort = kinds({ ...recording, torque }, 'effort');

    expect(effort).toEqual([{ kind: 'effort', at: 0.4 }]);
  });

  it('flags a try recorded on another model, and reads no joint limits through it', () => {
    const flags = flagsOf(recording, false);

    expect(flags[0]).toEqual({ kind: 'model', at: 0 });
    expect(flags.some((f) => f.kind === 'joint-limit')).toBe(false);
  });

  it('is deterministic, sorted by time and capped', () => {
    const torn = copy(recording);
    const row = torn.nbody * 7;

    for (let f = 1; f < torn.frames; f += 2) torn.poses.fill(NaN, f * row, (f + 1) * row);

    const flags = flagsOf(torn);

    expect(flags).toHaveLength(100);
    expect(flags).toEqual(flagsOf(torn));
    expect(flags.every((f, i) => i === 0 || f.at >= flags[i - 1].at)).toBe(true);
  });
});
