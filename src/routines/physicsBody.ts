import type { MainModule } from '@mujoco/mujoco';
import type { Skill, SkillController } from '../skills/artifacts';
import type { DriveSetup } from '../sim/drive';
import type { Controller, SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import type { RobotJoint } from '../types/robotics';
import { isNeck } from './capabilities';
import type { Motion } from './schema';
import { skillId } from './skillNames';

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
  drive: DriveSetup | null;
  skills: Record<string, SkillController>;
}

export type Command = [number, number, number];

export interface BodyControl {
  controller: Controller;
  command: Command | null;
}

export const SCRIPTED_FULL = { linear: 0.2, angular: 0.6 };

const KIT_NAMES = new Set<string>(Object.values(KIT_SKILL_NAMES));
const D2R = Math.PI / 180;

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

function ownSkills(model: SimModel, skills: readonly Skill[]): Record<string, SkillController> {
  const usable = skills.filter(
    (s) => !KIT_NAMES.has(s.name) && (s.controller.kind !== 'policy' || fits(model, s.controller.policy)),
  );

  return Object.fromEntries(usable.map((s) => [skillId(s.name), s.controller]));
}

export function routineBody(
  model: SimModel,
  joints: RobotJoint[],
  options: { skills: readonly Skill[]; drive?: DriveSetup | null },
): RoutineBody | null {
  const robot = model.robots.find((r) => r.floating);
  const { skills } = options;

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
    drive: options.drive ?? null,
    skills: ownSkills(model, skills),
  };
}

const commanded = (policy: PolicySpec, command: Command): PolicySpec => ({ ...policy, command });

export function moveCommand(skill: string | null, move?: Motion): Command | null {
  if (skill === 'walk' && move?.distance !== undefined) {
    const speed = move.speed ?? WALK_COMMAND[0];
    const heading = (move.heading ?? 0) * D2R;

    return [speed * Math.cos(heading), speed * Math.sin(heading), 0];
  }

  if (skill === 'turn-away' && move?.turn !== undefined) return [0, 0, Math.sign(move.turn) * TURN_COMMAND[2]];

  if (skill === 'walk') return WALK_COMMAND;

  return skill === 'turn-away' ? TURN_COMMAND : null;
}

const unit = (x: number) => Math.max(-1, Math.min(1, x));

export const scripted = (c: Command): Command => [
  unit(c[0] / SCRIPTED_FULL.linear),
  unit(c[1] / SCRIPTED_FULL.linear),
  unit(c[2] / SCRIPTED_FULL.angular),
];

type Hold = Record<string, number> | undefined;

function policyControl(body: RoutineBody, policy: PolicySpec, hold: Hold): BodyControl {
  return { controller: { kind: 'policy', policy, robot: body.robot, ...(hold ? { hold } : {}) }, command: null };
}

function velocityControl(body: RoutineBody, command: Command, hold: Hold): BodyControl {
  const { velocity } = body.policies;

  if (velocity) return policyControl(body, commanded(velocity, command), hold);

  if (body.drive) return { controller: { kind: 'drive', setup: body.drive }, command: scripted(command) };

  return { controller: { kind: 'hold', values: hold }, command: null };
}

function ownControl(body: RoutineBody, controller: SkillController, hold: Hold): BodyControl {
  if (controller.kind === 'policy') return policyControl(body, controller.policy, hold);

  return { controller, command: controller.kind === 'drive' ? [0, 0, 0] : null };
}

export function controlFor(
  body: RoutineBody,
  skills: { body: string | null; head: string | null },
  move?: Motion,
): BodyControl {
  const hold = body.neck && skills.head === 'look-at' ? { [body.neck]: LOOK_DEG } : undefined;
  const command = moveCommand(skills.body, move);
  const own = skills.body === null ? undefined : body.skills[skills.body];

  if (command) return velocityControl(body, command, hold);

  if (own) return ownControl(body, own, hold);

  if (body.policies.settle) return policyControl(body, body.policies.settle, hold);

  if (body.drive) return { controller: { kind: 'drive', setup: body.drive }, command: [0, 0, 0] };

  return { controller: { kind: 'hold', values: hold }, command: null };
}

export function applyControl(engine: SimEngine, next: BodyControl, previous: BodyControl | null) {
  const keepDrive = previous?.controller.kind === 'drive' && next.controller.kind === 'drive';

  if (!keepDrive) engine.setController(next.controller);

  if (next.command) engine.command({ v: next.command });
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
