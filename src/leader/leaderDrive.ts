import type { DriveCommand } from '../sim/driveTypes';
import type { LeaderLink } from '../types/projectRecords';
import type { JointValues, RobotJoint, ScenePart } from '../types/robotics';
import { followerArm } from './leaderArm';

export interface LeaderPlan {
  servos: string[];
  leads: Array<[leader: string, follower: string]>;
  trigger: string | null;
}

export interface LeaderZero {
  leader: Record<string, number>;
  follower: JointValues;
}

export interface LeaderPlanInput {
  leader: readonly RobotJoint[];
  leads: LeaderLink;
  follower: { parts: ScenePart[]; joints: RobotJoint[] };
}

const DEG = 180 / Math.PI;

export const TRIGGER_PULL_DEG = 40;

export function leaderPlan({ leader, leads, follower }: LeaderPlanInput): LeaderPlan {
  const servos = leader.filter((j) => j.type !== 'fixed').map((j) => j.id);
  const gripper = followerArm(follower.parts, follower.joints, leads.robot)?.gripper ?? null;
  const pairs = servos.flatMap((id): Array<[string, string]> => (leads.joints[id] ? [[id, leads.joints[id]]] : []));
  const trigger = gripper ? pairs.find(([, f]) => f === gripper.id) : undefined;

  return { servos, leads: pairs, trigger: trigger?.[0] ?? null };
}

export function leaderAngles(plan: LeaderPlan, radians: ReadonlyArray<number | null>): Record<string, number> {
  return Object.fromEntries(
    plan.servos.flatMap((id, k) => {
      const value = radians[k];

      return typeof value === 'number' && Number.isFinite(value) ? [[id, value * DEG]] : [];
    }),
  );
}

const unit = (x: number) => Math.max(0, Math.min(1, x));

export function leaderCommand(plan: LeaderPlan, zero: LeaderZero, now: Record<string, number>): DriveCommand {
  const joints: JointValues = {};

  for (const [leader, follower] of plan.leads) {
    if (now[leader] === undefined || zero.leader[leader] === undefined) continue;

    joints[follower] = (zero.follower[follower] ?? 0) + now[leader] - zero.leader[leader];
  }

  const { trigger } = plan;
  const pulled = trigger ? Math.abs((now[trigger] ?? 0) - (zero.leader[trigger] ?? 0)) : 0;

  return { v: [0, 0, 0], joints, aux: [0, unit(pulled / TRIGGER_PULL_DEG)] };
}
