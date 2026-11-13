import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { servoArm } from '../sim/fixtures/servoArm';
import type { RobotRun } from '../robot/runBuffer';
import { REPLAY_LEAD_S, replayCase, replayTimeline } from './replayCase';
import { runCase } from './runCase';
import { parseCase } from './schema';

const JOINTS = ['arm0', 'arm1', 'arm2'];
const RAD = Math.PI / 180;
const HEAVY_HAND_G = 700;

function stalledShoulder(): RobotRun {
  const statuses = Array.from({ length: 40 }, (_, k) => ({
    at: 10_000 + k * 100,
    positions: [Math.min(0.6, k * 0.02), Math.min(0.4, k * 0.01), null],
  }));
  const intents = Array.from({ length: 160 }, (_, k) => {
    const s = Math.min(1, k / 80);

    return { at: 9_950 + k * 25, joints: [s * 1.2, s * 0.4, 0] };
  });

  return { joints: JOINTS, statuses, intents, faultJoint: 'arm0', faultAt: 0, message: 'The Shoulder joint is stuck.' };
}

function armWith(shoulder: string) {
  const arm = servoArm((joint) => (joint === 'arm0' ? shoulder : 'c044'));
  const parts = arm.parts.map((p) => (p.id === 'hand' ? { ...p, massG: HEAVY_HAND_G } : p));

  return {
    id: 'scene',
    parts,
    joints: arm.joints,
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
  };
}

function built() {
  const made = replayCase({ run: stalledShoulder(), name: 'Fault at 2:32 PM' });

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('a robot run as a Case', () => {
  it('starts from the first measured pose, then plays every intent within 0.02 rad at its time', () => {
    const run = stalledShoulder();
    const [start, ...played] = replayTimeline(run);
    const from = run.statuses[0].at;
    const sent = run.intents.filter((i) => i.at >= from);

    expect(start).toEqual({ at: 0, joints: { arm0: 0, arm1: 0 } });

    for (const command of played) {
      const intent = sent.find((i) => Math.abs(REPLAY_LEAD_S + (i.at - from) / 1000 - command.at) < 1e-6)!;

      JOINTS.forEach((id, k) => expect(Math.abs(command.joints![id] * RAD - intent.joints[k])).toBeLessThan(0.02));
    }

    expect(played.at(-1)!.joints!.arm0 * RAD).toBeCloseTo(1.2, 4);
    expect(played[0].at).toBeCloseTo(REPLAY_LEAD_S, 6);
  });

  it('reads and writes back as a Case file, named and briefed from the fault', () => {
    const kase = built();

    expect(parseCase(JSON.parse(JSON.stringify(kase)))).toEqual(kase);
    expect(kase).toMatchObject({
      id: 'fault-at-2-32-pm',
      name: 'Fault at 2:32 PM',
      brief: 'The Shoulder joint is stuck.',
    });
    expect(() => parseCase({ ...kase, reference: { timeline: [{ at: 0, joints: { '../x': 1 } }] } })).toThrow(
      /plain id/,
    );
  });

  it('fails a stall replayed on a weaker shoulder servo and passes on a stronger one', async () => {
    const kase = built();
    const weak = await runCase(mj, kase, armWith('c046'), { controller: 'reference' });
    const strong = await runCase(mj, kase, armWith('c018'), { controller: 'reference' });
    const peak = (torque: number[]) => Math.max(...torque.slice(Math.round(REPLAY_LEAD_S / 0.02)));

    expect(weak.passed).toBe(false);
    expect(peak(weak.trace.signals.torque)).toBeGreaterThan(0.99);
    expect(strong.passed).toBe(true);
    expect(peak(strong.trace.signals.torque)).toBeLessThan(0.8);
  }, 60_000);
});
