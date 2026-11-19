import { solve3 } from '../utils/solve3';
import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { JointValues, RobotPoseState } from '../types/robotics';
import type { SkillController } from './artifacts';
import type { V3 } from './kitModel';
import { ArmConfiguration } from './armConfiguration';
import { planArmMotion } from './armMotion';
import { errorMessage } from '../utils/errorMessage';
import { modelHashes } from './artifacts';
import { hashOf } from './hash';

const R2D = 180 / Math.PI;
const SETTLE_S = 2;
const STEP_RAD = 1e-4;
const DAMPING = 1e-3;
const ITERATIONS = 200;
const RESTARTS = 12;
const FIT_M = 5e-4;
const SAG_ROUNDS = 6;

interface ArmJoint {
  id: string;
  qpos: number;
  range: [number, number];
}

interface Arm {
  engine: SimEngine;
  space: ArmConfiguration;
  joints: ArmJoint[];
  body: number;
}

export interface Waypoint {
  point: V3;
  holdS: number;
}

function openArm(mj: MainModule, model: SimModel, part: string): Arm {
  const space = new ArmConfiguration(mj, model, [part]);
  const engine = space.engine;
  const owner = model.bodies.find((b) => b.parts.includes(part))!;
  const body = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, owner.name);

  return { engine, space, joints: space.joints, body };
}

function pointAt(mj: MainModule, arm: Arm, q: number[]): V3 {
  const { engine } = arm;
  const qpos = engine.data.qpos;

  arm.joints.forEach((j, i) => (qpos[j.qpos] = q[i]));
  mj.mj_kinematics(engine.model, engine.data);

  const p = engine.data.xpos;

  return [p[arm.body * 3], p[arm.body * 3 + 1], p[arm.body * 3 + 2]];
}

const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (v: V3) => Math.hypot(...v);
const clampTo = (q: number[], arm: Arm) =>
  q.map((v, i) => Math.min(arm.joints[i].range[1], Math.max(arm.joints[i].range[0], v)));

function dampedStep(mj: MainModule, arm: Arm, q: number[], error: V3): number[] {
  const base = pointAt(mj, arm, q);
  const jac = q.map((_, i) => {
    const moved = [...q];

    moved[i] += STEP_RAD;

    return minus(pointAt(mj, arm, moved), base).map((d) => d / STEP_RAD) as V3;
  });
  const jjt = [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => jac.reduce((s, col) => s + col[r] * col[c], 0) + (r === c ? DAMPING : 0)),
  );
  const y = solve3(jjt, error);

  return clampTo(
    q.map((v, i) => v + jac[i][0] * y[0] + jac[i][1] * y[1] + jac[i][2] * y[2]),
    arm,
  );
}

function descend(mj: MainModule, arm: Arm, options: { target: V3; start: number[] }) {
  let q = clampTo(options.start, arm);

  for (let k = 0; k < ITERATIONS; k++) {
    const error = minus(options.target, pointAt(mj, arm, q));

    if (length(error) < FIT_M / 4) break;

    q = dampedStep(mj, arm, q, error);
  }

  return { q, miss: length(minus(options.target, pointAt(mj, arm, q))) };
}

function solvePoint(mj: MainModule, arm: Arm, options: { target: V3; start: number[] }) {
  let best = descend(mj, arm, options);
  let clear = arm.space.clear(best.q);

  for (let r = 0; r < RESTARTS && (best.miss > FIT_M || !clear); r++) {
    const start = arm.joints.map((j, i) =>
      r === 0 ? 0 : j.range[0] + ((j.range[1] - j.range[0]) * ((i * 7 + r * 3) % 11)) / 10,
    );
    const tried = descend(mj, arm, { ...options, start });

    const separated = arm.space.clear(tried.q);

    if (separated && (!clear || tried.miss < best.miss)) {
      best = tried;
      clear = true;
    }
  }

  return best;
}

function toValues(arm: Arm, q: number[]): JointValues {
  return Object.fromEntries(arm.joints.map((j, i) => [j.id, q[i] * R2D]));
}

function settledPoint(mj: MainModule, model: SimModel, options: { arm: Arm; values: JointValues }): V3 {
  const engine = new SimEngine(mj, model);

  try {
    const values = { ...model.initial.values, ...options.values };

    engine.setController({ kind: 'hold', values });
    engine.reset({ ...model.initial, values });
    engine.step(SETTLE_S);

    const p = engine.data.xpos;
    const b = options.arm.body;

    return [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
  } finally {
    engine.dispose();
  }
}

function planPoint(mj: MainModule, model: SimModel, options: { arm: Arm; target: V3; start: number[] }) {
  const { arm, target } = options;
  let aim = target;
  let start = options.start;
  let best = { q: start, miss: Infinity };

  for (let round = 0; round < SAG_ROUNDS; round++) {
    const fit = solvePoint(mj, arm, { target: aim, start });
    const reached = settledPoint(mj, model, { arm, values: toValues(arm, fit.q) });
    const error = minus(target, reached);

    if (length(error) < best.miss) best = { q: fit.q, miss: length(error) };

    if (length(error) < FIT_M) break;

    aim = [aim[0] + error[0], aim[1] + error[1], aim[2] + error[2]];
    start = fit.q;
  }

  return best;
}

export interface IkPlan {
  controller: SkillController | null;
  reason: string;
  missM: number;
  search?: { checks: number; nodes: number };
}

export interface ReachCandidate extends IkPlan {
  key: string;
  seed: number;
}

interface ReachContext {
  part: string;
  waypoints: Waypoint[];
  horizonS: number;
  start?: RobotPoseState;
  seed?: number;
}

export function reachPlanKey(model: SimModel, context: ReachContext): string {
  const { part, waypoints, horizonS, start } = context;

  return hashOf({ model: modelHashes(model), collision: model.collisionGeometry, part, waypoints, horizonS, start });
}

export function reachCandidate(model: SimModel, context: ReachContext, plan: IkPlan): ReachCandidate | undefined {
  if (new TextEncoder().encode(JSON.stringify(plan.controller)).byteLength > 64 * 1024) return undefined;

  return {
    ...plan,
    missM: Number.isFinite(plan.missM) ? plan.missM : 0,
    key: reachPlanKey(model, context),
    seed: context.seed ?? 1812,
  };
}

export async function planReach(
  mj: MainModule,
  model: SimModel,
  options: {
    part: string;
    waypoints: Waypoint[];
    horizonS: number;
    start?: RobotPoseState;
    seed?: number;
    stop?: () => boolean;
  },
): Promise<IkPlan> {
  model = { ...model, initial: options.start ?? model.initial };

  let opened: Arm | null = null;

  try {
    const arm = openArm(mj, model, options.part);

    opened = arm;

    const poses: number[][] = [];
    let start = arm.joints.map((j) => arm.engine.data.qpos[j.qpos] as number);
    let missM = 0;

    for (const w of options.waypoints) {
      if (options.stop?.()) return { controller: null, reason: 'Stopped.', missM };

      const fit = planPoint(mj, model, { arm, target: w.point, start });

      poses.push(fit.q);
      missM = Math.max(missM, fit.miss);
      start = fit.q;
    }

    const span = options.horizonS / poses.length;
    const keys = poses.flatMap((q, i) => [
      { t: (i + 1) * span - options.waypoints[i].holdS, values: toValues(arm, q) },
      { t: (i + 1) * span, values: toValues(arm, q) },
    ]);
    const plan = await planArmMotion(mj, model, {
      parts: [options.part],
      keys,
      horizonS: options.horizonS,
      seed: options.seed,
      stop: options.stop ?? (() => false),
    });

    return {
      controller: plan.controller,
      reason: plan.reason,
      missM,
      search: { checks: plan.checks, nodes: plan.nodes },
    };
  } catch (error) {
    return { controller: null, reason: errorMessage(error), missM: Infinity };
  } finally {
    opened?.space.dispose();
  }
}
