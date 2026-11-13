import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseRobot } from '../cases/testing';
import { radiansFromCounts } from '../robot/robotState';
import { driveAccess } from '../sim/driveAccess';
import { SimEngine } from '../sim/engine';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { fixtureRobots, withoutGripper } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { leaderRecording, so101Sized } from './fixtures';
import { leaderAngles, leaderCommand, leaderPlan } from './leaderDrive';
import { makeLeader } from './makeLeader';

const DEG = 180 / Math.PI;
const SETTLE_S = 0.5;
const STEP_S = 0.02;
const LATENCY_STEPS = 3;

function planFor(follower: FixtureRobot) {
  const leader = makeLeader({ parts: follower.parts, joints: follower.joints, sceneId: 'scene-follower' })!;

  return { leader, plan: leaderPlan({ leader: leader.joints, leads: leader.leads, follower }) };
}

function followerSim(follower: FixtureRobot) {
  const rig = buildRig(follower.joints, follower.parts);
  const model = buildMjcf({ ...caseRobot(follower), rig, project: DEFAULT_PROJECT });
  const access = driveAccess({ rig, parts: follower.parts, model });

  if (access.kind !== 'ready') throw new Error('The follower should drive.');

  return { model, setup: access.setup };
}

describe('a leader arm drives its follower', () => {
  it('tracks a recorded leader trajectory within 2° on every joint, 60 ms behind, and the trigger closes the grip', async () => {
    const follower = so101Sized();
    const { plan } = planFor(follower);
    const { model, setup } = followerSim(follower);
    const engine = new SimEngine(await loadMujoco(), model);
    const recording = leaderRecording(plan.servos.length, plan.servos.indexOf(plan.trigger!));
    const anglesAt = (i: number) => leaderAngles(plan, recording[i].positions.map(radiansFromCounts));
    const zero = { leader: anglesAt(0), follower: {} };
    const ids = model.joints.map((j) => j.id);
    const sent: Array<Record<string, number>> = [];
    let worst = 0;
    let grip = 0;

    expect(plan.trigger).toBe('gripper');
    engine.setController({ kind: 'drive', setup });

    recording.forEach((sample, i) => {
      const command = leaderCommand(plan, zero, anglesAt(i));

      engine.command(command);
      engine.step(STEP_S);
      sent.push(command.joints ?? {});
      grip = command.aux?.[1] ?? 0;

      if (sample.at_us / 1e6 < SETTLE_S) return;

      const states = engine.jointStates();

      for (const [id, target] of Object.entries(sent[i - LATENCY_STEPS])) {
        worst = Math.max(worst, Math.abs(states[ids.indexOf(id) * 3 + 1] * DEG - target));
      }
    });

    const gripper = engine.jointStates()[ids.indexOf('gripper') * 3 + 1] * DEG;

    expect(worst).toBeLessThan(2);
    expect(grip).toBe(1);
    expect(Math.abs(gripper)).toBeGreaterThan(30);
    engine.dispose();
  });

  it('maps every joint of a leader made from a 6-joint arm, in order, with no offset script', () => {
    const arm = withoutGripper(fixtureRobots().find((r) => r.id === 'arm-6dof')!);
    const movable = arm.joints.filter((j) => j.type !== 'fixed').map((j) => j.id);
    const { plan } = planFor(arm);
    const rest = Object.fromEntries(movable.map((id, k) => [id, 10 * k]));
    const leaderRest = Object.fromEntries(movable.map((id, k) => [id, -5 * k + 3]));
    const moved = Object.fromEntries(movable.map((id, k) => [id, leaderRest[id] + k + 1]));
    const { joints } = leaderCommand(plan, { leader: leaderRest, follower: rest }, moved);

    expect(movable).toHaveLength(6);
    expect(plan.servos).toEqual(movable);
    expect(plan.leads).toEqual(movable.map((id) => [id, id]));
    expect(plan.trigger).toBeNull();
    expect(Object.keys(joints!)).toEqual(movable);
    expect(movable.map((id) => joints![id])).toEqual(movable.map((id, k) => rest[id] + k + 1));
  });
});
