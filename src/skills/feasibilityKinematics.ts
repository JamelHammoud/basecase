import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { SimModel, SimRobot } from '../sim/mjcfTypes';

export type V3 = [number, number, number];

export interface Relaxation {
  effortScale: number;
  rangeDeg: number;
  linkScale: number;
}

export interface JointInfo {
  id: string;
  jid: number;
  qpos: number;
  dof: number;
  body: number;
  revolute: boolean;
  range: [number, number] | null;
  effort: number;
}

export interface Kin {
  mj: MainModule;
  model: MjModel;
  data: MjData;
  sim: SimModel;
  robot: SimRobot;
  root: number;
  joints: JointInfo[];
}

const D2R = Math.PI / 180;
const FD_STEP = 1e-6;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);

function scaleLinks(kin: Kin, factor: number) {
  const { model } = kin;

  for (let b = kin.root + 1; b < model.nbody; b++) {
    if (!isUnder(kin, b)) continue;

    for (let k = 0; k < 3; k++) {
      model.body_pos[b * 3 + k] *= factor;
      model.body_ipos[b * 3 + k] *= factor;
    }
  }

  for (let g = 0; g < model.ngeom; g++) {
    if (model.geom_bodyid[g] <= kin.root || !isUnder(kin, model.geom_bodyid[g])) continue;

    for (let k = 0; k < 3; k++) model.geom_pos[g * 3 + k] *= factor;

    for (let k = 0; k < 6; k++) model.geom_aabb[g * 6 + k] *= factor;
  }
}

export function isUnder(kin: Pick<Kin, 'model' | 'root'>, body: number): boolean {
  let b = body;

  while (b > 0 && b !== kin.root) b = kin.model.body_parentid[b];

  return b === kin.root;
}

function jointInfo(kin: Omit<Kin, 'joints'>, relax: Relaxation): JointInfo[] {
  const { mj, model, sim, robot } = kin;

  return sim.joints
    .filter((j) => j.robot === robot.key)
    .map((j) => {
      const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value, j.name);
      const revolute = j.type === 'revolute';
      const widen = revolute ? relax.rangeDeg * D2R : 0;
      const scale = revolute ? D2R : 0.001;
      const range = j.range ? ([j.range[0] * scale - widen, j.range[1] * scale + widen] as [number, number]) : null;

      return {
        id: j.id,
        jid: id,
        qpos: model.jnt_qposadr[id],
        dof: model.jnt_dofadr[id],
        body: model.jnt_bodyid[id],
        revolute,
        range,
        effort: j.effort * relax.effortScale,
      };
    });
}

export function openKin(mj: MainModule, sim: SimModel, options: { robot?: string; relax: Relaxation }): Kin {
  const robot = sim.robots.find((r) => r.key === options.robot) ?? sim.robots[0];

  if (!robot) throw new Error('The scene has no robot to check.');

  const model = mj.MjModel.from_xml_string(sim.xml);
  const data = new mj.MjData(model);
  const root = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, robot.root);
  const partial = { mj, model, data, sim, robot, root };
  const kin = { ...partial, joints: jointInfo(partial, options.relax) };

  scaleLinks(kin, options.relax.linkScale);
  mj.mj_resetData(model, data);
  setInitial(kin);

  return kin;
}

function setInitial(kin: Kin) {
  const values = kin.sim.initial.values;

  for (const j of kin.joints) {
    const v = values[j.id];

    if (v !== undefined) kin.data.qpos[j.qpos] = j.revolute ? v * D2R : v / 1000;
  }

  kin.mj.mj_kinematics(kin.model, kin.data);
}

export const closeKin = (kin: Kin) => {
  kin.data.delete();
  kin.model.delete();
};

export const refresh = (kin: Kin) => kin.mj.mj_kinematics(kin.model, kin.data);

export function bodyPoint(kin: Kin, body: number, local: V3): V3 {
  const { xpos, xmat } = kin.data;
  const m = (r: number, c: number) => xmat[body * 9 + r * 3 + c];
  const rotated: V3 = [0, 1, 2].map((r) => m(r, 0) * local[0] + m(r, 1) * local[1] + m(r, 2) * local[2]) as V3;

  return add([xpos[body * 3], xpos[body * 3 + 1], xpos[body * 3 + 2]], rotated);
}

export function toLocal(kin: Kin, body: number, world: V3): V3 {
  const { xpos, xmat } = kin.data;
  const d = sub(world, [xpos[body * 3], xpos[body * 3 + 1], xpos[body * 3 + 2]]);
  const m = (r: number, c: number) => xmat[body * 9 + r * 3 + c];

  return [0, 1, 2].map((c) => m(0, c) * d[0] + m(1, c) * d[1] + m(2, c) * d[2]) as V3;
}

function geomCorners(kin: Kin, g: number): V3[] {
  const { model, data } = kin;
  const a = (k: number) => model.geom_aabb[g * 6 + k];
  const corners: V3[] = [];

  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const local: V3 = [a(0) + sx * a(3), a(1) + sy * a(4), a(2) + sz * a(5)];
        const m = (r: number, c: number) => data.geom_xmat[g * 9 + r * 3 + c];

        corners.push(
          [0, 1, 2].map(
            (r) => data.geom_xpos[g * 3 + r] + m(r, 0) * local[0] + m(r, 1) * local[1] + m(r, 2) * local[2],
          ) as V3,
        );
      }

  return corners;
}

export function bodyCorners(kin: Kin, body: number): V3[] {
  const out: V3[] = [];

  for (let g = 0; g < kin.model.ngeom; g++) if (kin.model.geom_bodyid[g] === body) out.push(...geomCorners(kin, g));

  return out;
}

export function chainOf(kin: Kin, body: number): JointInfo[] {
  const bodies = new Set<number>();

  for (let b = body; b > 0 && b !== kin.root; b = kin.model.body_parentid[b]) bodies.add(b);

  return kin.joints.filter((j) => bodies.has(j.body));
}

export function pointJacobian(kin: Kin, options: { body: number; local: V3; joints: JointInfo[] }): V3[] {
  const { body, local, joints } = options;
  const base = bodyPoint(kin, body, local);

  return joints.map((j) => {
    const keep = kin.data.qpos[j.qpos];

    kin.data.qpos[j.qpos] = keep + FD_STEP;
    refresh(kin);

    const moved = bodyPoint(kin, body, local);

    kin.data.qpos[j.qpos] = keep;

    return sub(moved, base).map((v) => v / FD_STEP) as V3;
  });
}

const clamp = (j: JointInfo, v: number) => (j.range ? Math.max(j.range[0], Math.min(j.range[1], v)) : v);

function solve3(m: number[][], b: V3): V3 {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  const column = (c: number) => m.map((row, r) => row.map((v, k) => (k === c ? b[r] : v)));

  return [0, 1, 2].map((c) => det(column(c)) / d) as V3;
}

export function solveDls(jac: V3[], error: V3, damping: number): number[] {
  const jjt = [0, 1, 2].map((r) => [0, 1, 2].map((c) => jac.reduce((s, col) => s + col[r] * col[c], 0)));

  for (let i = 0; i < 3; i++) jjt[i][i] += damping * damping;

  const y = solve3(jjt, error);

  return jac.map((col) => col[0] * y[0] + col[1] * y[1] + col[2] * y[2]);
}

export function reachPoint(kin: Kin, options: { body: number; local: V3; target: V3; joints: JointInfo[] }): number {
  const { body, local, target, joints } = options;
  let gap = norm(sub(target, bodyPoint(kin, body, local)));

  for (let step = 0; step < 60 && gap > 1e-4; step++) {
    const jac = pointJacobian(kin, { body, local, joints });
    const dq = solveDls(jac, sub(target, bodyPoint(kin, body, local)), 0.02);

    joints.forEach((j, i) => (kin.data.qpos[j.qpos] = clamp(j, kin.data.qpos[j.qpos] + dq[i])));
    refresh(kin);
    gap = norm(sub(target, bodyPoint(kin, body, local)));
  }

  return gap;
}

export const clampJoint = clamp;
