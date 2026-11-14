import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { referenceTry } from '../cases/testing';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import type { SegmentFrames, SegmentRobot } from './segmentFrames';
import { segmentInput } from './segmentInput';
import { segmentTry, type Segment, type SegmentEvent } from './segments';

const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;

async function pickTry() {
  const mj = await loadMujoco();
  const rig = buildRig(arm.joints, arm.parts);
  const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(rig, arm.parts));

  if (!built.ok) throw new Error(built.problem);

  const kase = {
    ...built.kase,
    world: {
      ...built.kase.world,
      objects: built.kase.world.objects.map((o) => (o.id === 'block' ? { ...o, name: 'Red Block' } : o)),
    },
  };
  const { source } = await referenceTry(mj, kase, arm);
  const scene = {
    model: source.model,
    rig,
    parts: arm.parts,
    joints: arm.joints,
    effector: source.effector,
    objects: source.kase.world.objects,
  };

  return { recording: source.recording, scene };
}

const labels = (segments: Segment[]) => segments.map((s) => s.label);

const RATE = 50;

interface Pose {
  x: number;
  y: number;
  yaw: number;
}

function framesOf(seconds: number, pose: (t: number) => Pose): SegmentFrames {
  const frames = Math.round(seconds * RATE);
  const poses = new Float32Array(frames * 7);

  for (let f = 0; f < frames; f++) {
    const p = pose(f / RATE);

    poses.set([p.x, p.y, 0.1, Math.cos(p.yaw / 2), 0, 0, Math.sin(p.yaw / 2)], f * 7);
  }

  return { frames, dt: 1 / RATE, nbody: 1, nu: 0, nq: 0, poses, ctrl: [], qpos: [] };
}

const lone = (mobility: SegmentRobot['mobility']): SegmentRobot => ({
  bodies: [0],
  root: 0,
  mobility,
  jaws: [],
  effector: null,
  objects: [],
});

const marks = (events: SegmentEvent[] = []) => ({ stages: [], events, real: false });

const swing = (t: number): Pose => ({ x: 0.2 + 0.05 * Math.sin(t * 6), y: 0, yaw: 0 });

describe('segments by rule', () => {
  let pick: Awaited<ReturnType<typeof pickTry>>;

  beforeAll(async () => {
    pick = await pickTry();
  }, 60000);

  it('splits a pick-and-place sim try into reach, grasp, lift, carry, place and release, naming the red block', () => {
    const segments = segmentTry(segmentInput(pick.recording, { scene: pick.scene, stages: [], real: false }));

    expect(labels(segments).filter((l) => l !== 'idle')).toEqual([
      'reach the red block',
      'grasp the red block',
      'lift the red block',
      'carry the red block',
      'place the red block',
      'release the red block',
    ]);
    expect(segments[0].start).toBe(0);
    expect(segments.at(-1)!.end).toBe(pick.recording.frames);
    segments.slice(1).forEach((s, i) => expect(s.start).toBe(segments[i].end));
  });

  it('splits a leader-arm try on the gripper alone', () => {
    const segments = segmentTry(segmentInput(pick.recording, { scene: pick.scene, stages: [], real: true }));

    expect(labels(segments).filter((l) => l !== 'idle')).toEqual(['reach', 'grasp', 'release']);
  });

  it('gives the same segments for the same try', () => {
    const input = () => segmentInput(pick.recording, { scene: pick.scene, stages: [120], real: false });

    expect(segmentTry(input())).toEqual(segmentTry(input()));
  });

  it('splits a walking quadruped into walk, turn and stand', () => {
    const frames = framesOf(5, (t) => {
      const walked = Math.min(t, 2) * 0.15;

      return { x: walked, y: 0, yaw: Math.max(0, Math.min(t, 3.5) - 2) };
    });

    expect(labels(segmentTry({ frames, robot: lone('legs'), marks: marks() }))).toEqual(['walk', 'turn', 'stand']);
  });

  it('marks a wave segment from a wave gesture event', () => {
    const frames = framesOf(6, (t) => (t >= 1 && t < 3 ? swing(t) : { x: t < 1 ? 0.2 : swing(3).x, y: 0, yaw: 0 }));
    const segments = segmentTry({ frames, robot: lone(null), marks: marks([{ at: 1, name: 'wave' }]) });
    const wave = segments.find((s) => s.label === 'wave')!;

    expect(wave.start).toBe(RATE);
    expect(wave.end).toBeGreaterThan(2.8 * RATE);
    expect(wave.end).toBeLessThan(3.2 * RATE);
  });

  it('cuts a dance into segments at its MIDI beats', () => {
    const frames = framesOf(4, swing);
    const beats = [0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((at) => ({ at, name: 'beat' }));
    const segments = segmentTry({ frames, robot: lone(null), marks: marks(beats) });

    expect(segments.map((s) => s.start)).toEqual([0, ...beats.map((b) => b.at * RATE)]);
  });
});
