import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { segmentInputOf } from '../cases/segmentInput';
import { referenceTry } from '../cases/testing';
import { trySignals } from '../cases/tries';
import type { TrySegment } from '../cases/tryLabels';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { RecordedInput, Recording } from '../sim/recorder';
import { buildRig } from '../utils/kinematics';
import { segmentTry, type SegmentInput } from './segments';
import { segmentInWorker } from './segmentsClient';

const DT = 0.02;
const ROOT = 7;
const LEG_JOINTS = 12;

const arm6 = () => fixtureRobots().find((r) => r.id === 'arm-6dof')!;

interface Synthetic {
  seconds: number;
  joints: number;
  pose: (t: number, q: Float64Array) => void;
  mobile?: boolean;
  inputs?: RecordedInput[];
}

function synthetic({ seconds, joints, pose, mobile = false, inputs }: Synthetic): Recording {
  const frames = Math.round(seconds / DT);
  const nq = joints + (mobile ? ROOT : 0);
  const nv = joints + (mobile ? ROOT - 1 : 0);
  const qpos = new Float64Array(frames * nq);
  const first = mobile ? ROOT : 0;

  for (let f = 0; f < frames; f++) pose(f * DT, qpos.subarray(f * nq, (f + 1) * nq));

  return {
    dt: DT,
    frames,
    nq,
    nv,
    nu: 0,
    nbody: 1,
    t: Float32Array.from({ length: frames }, (_, f) => f * DT),
    ctrl: new Float32Array(0),
    qpos,
    qvel: new Float32Array(frames * nv),
    poses: new Float32Array(frames * 7),
    jointQpos: Int32Array.from({ length: joints }, (_, i) => first + i),
    jointDof: Int32Array.from({ length: joints }, (_, i) => first - (mobile ? 1 : 0) + i),
    root: mobile ? [0, 0] : [-1, -1],
    ...(inputs ? { inputs } : {}),
  };
}

const plain = (recording: Recording, extra: Partial<SegmentInput> = {}): SegmentInput => ({
  recording,
  model: null,
  kind: 'real',
  jaws: [],
  hand: null,
  objects: [],
  stages: [],
  base: 'fixed',
  ...extra,
});

const labels = (segments: TrySegment[]) => segments.map((s) => s.label);

const startOf = (segments: TrySegment[], label: string) => segments.find((s) => s.label === label)!.from;

function expectCovering(segments: TrySegment[], frames: number) {
  expect(segments[0].from).toBe(0);
  expect(segments.at(-1)!.to).toBe(frames);
  segments.forEach((s, i) => {
    expect(s.to).toBeGreaterThan(s.from);

    if (i > 0) expect(s.from).toBe(segments[i - 1].to);
  });
}

const ramp = (t: number, from: number, seconds: number) => Math.min(1, Math.max(0, (t - from) / seconds));

describe('a pick-and-place try in MuJoCo', () => {
  let input: SegmentInput;

  beforeAll(async () => {
    const robot = arm6();
    const built = buildCase(
      { goal: 'pick', world: 'floor' },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    if (!built.ok) throw new Error(built.problem);

    const { source } = await referenceTry(await loadMujoco(), built.kase, robot);

    input = segmentInputOf({
      recording: source.recording,
      model: source.model,
      rig: source.rig,
      parts: robot.parts,
      kase: source.kase,
      kind: 'sim',
      trace: trySignals(source),
    });
  }, 60000);

  it('splits into reach, grasp, lift, carry, place and release, naming the block', () => {
    const segments = segmentTry(input);

    expect(input.jaws.map((j) => j.closed)).toEqual([0.025, -0.025]);
    expect(input.objects.map((o) => o.name)).toEqual(['Block']);
    expect(labels(segments)).toEqual([
      'reach block',
      'grasp block',
      'lift block',
      'carry block',
      'place block',
      'release block',
      'idle',
    ]);
    expectCovering(segments, input.recording.frames);
  });

  it('finds the Case’s lift stage inside the lift', () => {
    const segments = segmentTry(input);
    const lift = segments.find((s) => s.label === 'lift block')!;

    expect(input.stages).toHaveLength(1);
    expect(input.stages[0]).toBeGreaterThanOrEqual(lift.from);
    expect(input.stages[0]).toBeLessThan(lift.to);
  });

  it('gives the same segments every time, in the worker or not', async () => {
    expect(segmentTry(input)).toEqual(segmentTry(input));
    expect(await segmentInWorker(input)).toEqual(segmentTry(input));
  });
});

describe('a real try', () => {
  const jaw = { qpos: 1, open: 0, closed: 0.025 };

  it('splits a leader arm’s try on its gripper alone', () => {
    const recording = synthetic({
      seconds: 4,
      joints: 2,
      pose: (t, q) => {
        q[0] = 0.5 * Math.min(t, 1) + 0.5 * Math.min(Math.max(0, t - 1.2), 1.3);
        q[1] = 0.025 * (ramp(t, 1, 0.2) - ramp(t, 2.5, 0.2)) + (t > 1.3 && t < 2.5 ? 0.003 * Math.sin(t * 40) : 0);
      },
    });
    const segments = segmentTry(plain(recording, { jaws: [jaw] }));

    expect(labels(segments)).toEqual(['reach', 'grasp', 'carry', 'release', 'idle']);
    expect(startOf(segments, 'grasp') * DT).toBeCloseTo(1.1, 0);
    expect(startOf(segments, 'release') * DT).toBeCloseTo(2.6, 0);
    expectCovering(segments, recording.frames);
  });

  it('doesn’t split on a gripper that jitters about its midpoint', () => {
    const recording = synthetic({
      seconds: 3,
      joints: 2,
      pose: (t, q) => {
        q[0] = 0.4 * t;
        q[1] = 0.0125 + 0.002 * Math.sin(t * 30);
      },
    });

    expect(labels(segmentTry(plain(recording, { jaws: [jaw] })))).toEqual(['reach']);
  });
});

describe('a walking quadruped', () => {
  it('splits into walk, turn and stand', () => {
    const recording = synthetic({
      seconds: 4.5,
      joints: LEG_JOINTS,
      mobile: true,
      pose: (t, q) => {
        const yaw = Math.min(Math.max(0, t - 1.5), 1.5);
        const gait = t < 3 ? 0.4 * Math.sin(t * 12) : 0;

        q.set([0.2 * Math.min(t, 1.5), 0, 0.3, Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)]);
        q.fill(gait, ROOT);
      },
    });
    const segments = segmentTry({ ...plain(recording, { base: 'legs' }), kind: 'sim' });

    expect(labels(segments)).toEqual(['walk', 'turn', 'stand']);
    expect(startOf(segments, 'turn') * DT).toBeCloseTo(1.5, 0);
    expect(startOf(segments, 'stand') * DT).toBeCloseTo(3, 0);
    expectCovering(segments, recording.frames);
  });
});

describe('input events', () => {
  it('marks a wave from a wave event, for at most 1.5 s', () => {
    const recording = synthetic({
      seconds: 4,
      joints: 1,
      pose: () => {},
      inputs: [{ at: 1, name: 'Wave', value: true }],
    });

    expect(segmentTry(plain(recording))).toEqual([
      { from: 0, to: 50, label: 'idle' },
      { from: 50, to: 125, label: 'wave' },
      { from: 125, to: 200, label: 'idle' },
    ]);
  });

  it('cuts a dance at each MIDI beat, and ignores released keys', () => {
    const beats = [0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((at) => ({ at, name: 'beat', value: 100 }));
    const recording = synthetic({
      seconds: 4,
      joints: 3,
      pose: (t, q) => q.fill(Math.sin(t * 6)),
      inputs: [...beats, { at: 1.2, name: 'note', value: false }],
    });
    const segments = segmentTry(plain(recording));

    expect(segments.map((s) => s.from)).toEqual([0, 25, 50, 75, 100, 125, 150, 175]);
    expect(new Set(labels(segments))).toEqual(new Set(['reach']));
    expect(segmentTry(plain(recording))).toEqual(segments);
  });
});

describe('Case stages', () => {
  it('cut a segment where a stage begins, unless it would leave a piece under 0.2 s', () => {
    const recording = synthetic({ seconds: 4, joints: 1, pose: () => {} });

    expect(segmentTry(plain(recording, { stages: [100, 105, 400] }))).toEqual([
      { from: 0, to: 100, label: 'idle' },
      { from: 100, to: 200, label: 'idle' },
    ]);
  });
});
