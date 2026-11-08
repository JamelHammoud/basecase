import type { MainModule } from '@mujoco/mujoco';
import type { Skill } from '../skills/artifacts';
import type { Controller, SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import type { RobotJoint } from '../types/robotics';
import { isNeck } from './capabilities';

export const KIT_SKILL_NAMES = {
  velocity: 'Velocity tracking',
  settle: 'Settle to neutral',
  stand: 'Stand',
} as const;

export const WALK_COMMAND: [number, number, number] = [0.2, 0, 0];
export const TURN_COMMAND: [number, number, number] = [0, 0, 0.6];
export const LOOK_DEG = 25;
export const SKILL_SECONDS: Record<string, number> = { settle: 1.5, 'turn-away': 2.5, 'look-at': 1 };

export interface KitPolicies {
  velocity: PolicySpec | null;
  settle: PolicySpec | null;
}

export interface RoutineBody {
  model: SimModel;
  robot: string;
  policies: KitPolicies;
  neck: string | null;
}

function fits(model: SimModel, policy: PolicySpec): boolean {
  const ids = new Set(model.joints.map((j) => j.id));

  return policy.joints.every((id) => ids.has(id));
}

function policyNamed(model: SimModel, skills: readonly Skill[], names: string[]): PolicySpec | null {
  for (const name of names) {
    const found = skills.find(
      (s) => s.name === name && s.controller.kind === 'policy' && fits(model, s.controller.policy),
    );

    if (found?.controller.kind === 'policy') return found.controller.policy;
  }

  return null;
}

export function routineBody(model: SimModel, joints: RobotJoint[], skills: readonly Skill[]): RoutineBody | null {
  const robot = model.robots.find((r) => r.floating);

  if (!robot) return null;

  const neckJoint = joints.find((j) => isNeck(j) && model.joints.some((s) => s.id === j.id && s.actuator >= 0));

  return {
    model,
    robot: robot.key,
    policies: {
      velocity: policyNamed(model, skills, [KIT_SKILL_NAMES.velocity]),
      settle: policyNamed(model, skills, [KIT_SKILL_NAMES.settle, KIT_SKILL_NAMES.stand]),
    },
    neck: neckJoint?.id ?? null,
  };
}

const commanded = (policy: PolicySpec, command: [number, number, number]): PolicySpec => ({ ...policy, command });

function bodyPolicy(body: RoutineBody, skill: string | null): PolicySpec | null {
  const { velocity, settle } = body.policies;

  if (skill === 'walk') return velocity && commanded(velocity, WALK_COMMAND);

  if (skill === 'turn-away') return velocity && commanded(velocity, TURN_COMMAND);

  return settle;
}

export function controllerFor(body: RoutineBody, skills: { body: string | null; head: string | null }): Controller {
  const hold = body.neck && skills.head === 'look-at' ? { [body.neck]: LOOK_DEG } : undefined;
  const policy = bodyPolicy(body, skills.body);

  if (!policy) return { kind: 'hold', values: hold };

  return { kind: 'policy', policy, robot: body.robot, ...(hold ? { hold } : {}) };
}

export interface BodyPose {
  base: [number, number, number];
  yaw: number;
  tilt: number;
}

export class BodyProbe {
  private readonly engine: SimEngine;
  private readonly rootBody: number;
  private readonly joints: Array<{ id: string; qpos: number }>;

  constructor(mj: MainModule, engine: SimEngine, body: RoutineBody) {
    const root = body.model.robots.find((r) => r.key === body.robot)?.root ?? '';
    const BODY = mj.mjtObj.mjOBJ_BODY.value;
    const JOINT = mj.mjtObj.mjOBJ_JOINT.value;

    this.engine = engine;
    this.rootBody = mj.mj_name2id(engine.model, BODY, root);
    this.joints = body.model.joints.map((j) => ({
      id: j.id,
      qpos: engine.model.jnt_qposadr[mj.mj_name2id(engine.model, JOINT, j.name)],
    }));
  }

  pose(): BodyPose {
    const { xpos, xquat, xmat } = this.engine.data;
    const b = this.rootBody;
    const [w, x, y, z] = [xquat[b * 4], xquat[b * 4 + 1], xquat[b * 4 + 2], xquat[b * 4 + 3]];

    return {
      base: [xpos[b * 3], xpos[b * 3 + 1], xpos[b * 3 + 2]],
      yaw: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
      tilt: Math.acos(Math.max(-1, Math.min(1, xmat[b * 9 + 8]))),
    };
  }

  joint(id: string): number {
    const at = this.joints.find((j) => j.id === id)?.qpos ?? -1;

    return at >= 0 ? this.engine.data.qpos[at] : Number.NaN;
  }

  jointValues(): Record<string, number> {
    return Object.fromEntries(this.joints.map((j) => [j.id, this.engine.data.qpos[j.qpos]]));
  }

  fellAt(): number | null {
    return this.engine.stats().robots[0]?.fellAt ?? null;
  }
}
