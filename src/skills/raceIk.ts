import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { JointValues, RobotAnimation } from '../types/robotics';
import type { SkillController } from './artifacts';
import type { V3 } from './kitModel';

const R2D = 180 / Math.PI;
const SETTLE_S = 2;
const STEP_RAD = 1e-4;
const DAMPING = 1e-3;
const ITERATIONS = 200;
const RESTARTS = 12;
const FIT_M = 5e-4;
const SAG_ROUNDS = 6;
const MOVE_S = 0.4;

interface ArmJoint {
  id: string;
  qpos: number;
  range: [number, number];
}

interface Arm {
  engine: SimEngine;
  joints: ArmJoint[];
  body: number;
}

export interface Waypoint {
  point: V3;
  holdS: number;
}

function openArm(mj: MainModule, model: SimModel, part: string): Arm {
  const engine = new SimEngine(mj, model);
  const robot = model.robots[0].key;
  const owner = model.bodies.find((b) => b.parts.includes(part));
  const body = owner ? mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, owner.name) : -1;

  if (body < 0) {
    engine.dispose();

    throw new Error(`The model has no part ${part}.`);
  }

  const joints = model.joints
    .filter((j) => j.robot === robot && j.actuator >= 0 && j.drive === 'position' && j.type === 'revolute')
    .map((j) => {
      const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, j.name);
      const range = j.range ?? [-180, 180];

      return {
        id: j.id,
        qpos: engine.model.jnt_qposadr[id],
        range: [range[0] / R2D, range[1] / R2D] as [number, number],
      };
    });

  return { engine, joints, body };
}

function pointAt(mj: MainModule, arm: Arm, q: number[]): V3 {
  const { engine } = arm;

  arm.joints.forEach((j, i) => (engine.data.qpos[j.qpos] = q[i]));
  mj.mj_kinematics(engine.model, engine.data);

  const p = engine.data.xpos;

  return [p[arm.body * 3], p[arm.body * 3 + 1], p[arm.body * 3 + 2]];
}

const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (v: V3) => Math.hypot(...v);
const clampTo = (q: number[], arm: Arm) =>
  q.map((v, i) => Math.min(arm.joints[i].range[1], Math.max(arm.joints[i].range[0], v)));

function solve3(m: number[][], b: V3): V3 {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);

  return [0, 1, 2].map((k) => det(m.map((row, r) => row.map((v, c) => (c === k ? b[r] : v)))) / d) as V3;
}

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

  for (let r = 0; r < RESTARTS && best.miss > FIT_M; r++) {
    const start = arm.joints.map((j, i) =>
      r === 0 ? 0 : j.range[0] + ((j.range[1] - j.range[0]) * ((i * 7 + r * 3) % 11)) / 10,
    );
    const tried = descend(mj, arm, { ...options, start });

    if (tried.miss < best.miss) best = tried;
  }

  return best;
}

function toValues(arm: Arm, q: number[]): JointValues {
  return Object.fromEntries(arm.joints.map((j, i) => [j.id, q[i] * R2D]));
}

function settledPoint(mj: MainModule, model: SimModel, options: { arm: Arm; values: JointValues }): V3 {
  const engine = new SimEngine(mj, model);

  try {
    engine.setController({ kind: 'hold', values: { ...model.initial.values, ...options.values } });
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
  controller: SkillController;
  missM: number;
}

export function planReach(
  mj: MainModule,
  model: SimModel,
  options: { part: string; waypoints: Waypoint[]; horizonS: number },
): IkPlan {
  const arm = openArm(mj, model, options.part);

  try {
    const poses: number[][] = [];
    let start = arm.joints.map(() => 0);
    let missM = 0;

    for (const w of options.waypoints) {
      const fit = planPoint(mj, model, { arm, target: w.point, start });

      poses.push(fit.q);
      missM = Math.max(missM, fit.miss);
      start = fit.q;
    }

    return { controller: controllerFor(model, { arm, poses, horizonS: options.horizonS }), missM };
  } finally {
    arm.engine.dispose();
  }
}

function controllerFor(model: SimModel, options: { arm: Arm; poses: number[][]; horizonS: number }): SkillController {
  const { arm, poses, horizonS } = options;
  const values = poses.map((q) => ({ ...model.initial.values, ...toValues(arm, q) }));

  if (values.length === 1) return { kind: 'hold', values: values[0] };

  const span = horizonS / values.length;
  const keyframes = values.flatMap((v, k) =>
    k === 0
      ? [{ t: 0, values: v }]
      : [
          { t: k * span - MOVE_S, values: values[k - 1] },
          { t: k * span, values: v },
        ],
  );
  const animation: RobotAnimation = {
    id: 'reach-plan',
    name: 'Reach plan',
    duration: horizonS,
    loop: false,
    keyframes,
    interpolation: 'linear',
  };

  return { kind: 'animation', animation };
}
