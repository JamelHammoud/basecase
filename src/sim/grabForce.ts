import type { MjData, MjModel } from '@mujoco/mujoco';
import { axisAngle, conj, quatMul, rotate } from './quat';

interface Held {
  body: number;
  local: number[];
  target: [number, number, number];
  startQuat: number[];
  targetQuat: number[] | null;
  mass: number;
  last: { p: number[]; q: number[] } | null;
}

const WN = 12;
const ZETA = 1;

export class GrabForce {
  private held: Held | null = null;
  private readonly model: MjModel;
  private readonly data: MjData;
  private readonly dt: number;

  constructor(model: MjModel, data: MjData, dt: number) {
    this.model = model;
    this.data = data;
    this.dt = dt;
  }

  start(id: number, point: [number, number, number]) {
    this.end();

    const { data, model } = this;
    const q = [data.xquat[id * 4], data.xquat[id * 4 + 1], data.xquat[id * 4 + 2], data.xquat[id * 4 + 3]];
    const rel = [point[0] - data.xpos[id * 3], point[1] - data.xpos[id * 3 + 1], point[2] - data.xpos[id * 3 + 2]];
    let root = id;

    while (model.body_parentid[root] !== 0) root = model.body_parentid[root];

    this.held = {
      body: id,
      local: rotate(conj(q), rel),
      target: point,
      startQuat: q,
      targetQuat: null,
      mass: Math.max(model.body_subtreemass[root], 0.05),
      last: null,
    };
  }

  move(point: [number, number, number], turn: [number, number, number, number] | null) {
    const g = this.held;

    if (!g) return;

    g.target = point;
    g.targetQuat = turn ? quatMul(turn, g.startQuat) : null;
  }

  end() {
    if (this.held) this.data.xfrc_applied.fill(0, this.held.body * 6, this.held.body * 6 + 6);

    this.held = null;
  }

  forget() {
    this.held = null;
  }

  apply() {
    const g = this.held;

    if (!g) return;

    const { data } = this;
    const b = g.body;
    const q = [data.xquat[b * 4], data.xquat[b * 4 + 1], data.xquat[b * 4 + 2], data.xquat[b * 4 + 3]];
    const r = rotate(q, g.local);
    const p = [data.xpos[b * 3] + r[0], data.xpos[b * 3 + 1] + r[1], data.xpos[b * 3 + 2] + r[2]];
    const v = g.last ? p.map((x, i) => (x - g.last!.p[i]) / this.dt) : [0, 0, 0];
    const cap = g.mass * 9.81 * 8;
    const f = [0, 1, 2].map((i) => {
      const spring = g.mass * (WN * WN * (g.target[i] - p[i]) - 2 * ZETA * WN * v[i]);

      return Math.max(-cap, Math.min(cap, spring)) + (i === 2 ? g.mass * 9.81 : 0);
    });
    const arm = [p[0] - data.xipos[b * 3], p[1] - data.xipos[b * 3 + 1], p[2] - data.xipos[b * 3 + 2]];
    const torque = [arm[1] * f[2] - arm[2] * f[1], arm[2] * f[0] - arm[0] * f[2], arm[0] * f[1] - arm[1] * f[0]];

    if (g.targetQuat) {
      const e = axisAngle(quatMul(g.targetQuat, conj(q)));
      const w = g.last ? axisAngle(quatMul(q, conj(g.last.q))).map((x) => x / this.dt) : [0, 0, 0];
      const inertia = g.mass * 0.05 * 0.05;

      for (let i = 0; i < 3; i++) torque[i] += inertia * (WN * WN * e[i] - 2 * ZETA * WN * w[i]);
    }

    const xf = data.xfrc_applied;

    for (let i = 0; i < 3; i++) {
      xf[b * 6 + i] = f[i];
      xf[b * 6 + 3 + i] = torque[i];
    }

    g.last = { p, q };
  }
}
