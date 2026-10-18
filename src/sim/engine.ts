/**
 * Runs a SimModel in MuJoCo: steps it, drives each joint's actuator from a controller (hold a
 * pose, follow keyframes, or a trained policy), pushes the robot, and reports what happened
 * (falls, how hard each actuator worked). Used by the simulation worker; it has no DOM, so it
 * also runs in Node for tests.
 */
import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { RobotAnimation, RobotPoseState } from '../types/robotics';
import { sampleAnimation } from '../utils/animation';
import type { SimModel } from './mjcf';
import { act, observe, obsSize, type ObsSource, type PolicySpec } from './policy';

export type Controller =
  /** Hold joints at these values (degrees / mm); the canvas pose when empty */
  | { kind: 'hold'; values?: Record<string, number> }
  /** Follow an animation's keyframes */
  | { kind: 'animation'; animation: RobotAnimation }
  /** A trained policy drives one robot; other robots hold */
  | { kind: 'policy'; policy: PolicySpec; robot: string }
  /** Actuators off */
  | { kind: 'limp' };

export interface JointStat {
  id: string;
  /** Peak |force| / limit since reset, 0–1 */
  peak: number;
  /** Seconds spent at the limit (≥ 98%) */
  saturatedS: number;
}

export interface RobotStat {
  key: string;
  /** Sim time it fell, or null */
  fellAt: number | null;
  /** Root height above its start, m */
  height: number;
  /** Tilt from upright, degrees */
  tilt: number;
  /** Ground distance travelled from the start, m */
  travelled: number;
  /** Displacement from the start along the robot's own forward (−Y at rest), m */
  forward: number;
}

export interface SimStats {
  time: number;
  robots: RobotStat[];
  joints: JointStat[];
  /** Real-time factor over the last second */
  rtf: number;
}

const D2R = Math.PI / 180;

type Q = ArrayLike<number>;
const conj = (q: Q) => [q[0], -q[1], -q[2], -q[3]];
const quatMul = (a: Q, b: Q) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
/** v rotated by unit quaternion q */
const rotate = (q: Q, v: ArrayLike<number>) => {
  const r = quatMul(quatMul(q, [0, v[0], v[1], v[2]]), conj(q));
  return [r[1], r[2], r[3]];
};
/** Rotation vector (axis × angle) of a unit quaternion, the short way round */
function axisAngle(q: Q): [number, number, number] {
  const s = q[0] < 0 ? -1 : 1;
  const w = Math.min(1, Math.abs(q[0]));
  const n = Math.hypot(q[1], q[2], q[3]);
  if (n < 1e-9) return [0, 0, 0];
  const angle = 2 * Math.atan2(n, w);
  return [(s * q[1] * angle) / n, (s * q[2] * angle) / n, (s * q[3] * angle) / n];
}

export class SimEngine {
  readonly model: MjModel;
  readonly data: MjData;
  private bodyIds: number[];
  private jointQpos: number[];
  private jointDof: number[];
  private robots: Array<{ key: string; rootQpos: number; rootDof: number; rootBody: number; floating: boolean; joints: number[]; startZ: number; startXY: [number, number] }>;
  private controller: Controller = { kind: 'hold' };
  private peaks: Float64Array;
  private saturated: Float64Array;
  private fellAt = new Map<string, number>();
  private push: { body: number; force: [number, number, number]; until: number } | null = null;
  /** A body held by the canvas gizmo: pulled toward a target on a spring, like MuJoCo's viewer */
  private grabbed: {
    body: number;
    /** The held point in the body's frame */
    local: number[];
    target: [number, number, number];
    startQuat: number[];
    targetQuat: number[] | null;
    mass: number;
    last: { p: number[]; q: number[] } | null;
  } | null = null;
  private policyState: { action: Float32Array; obs: Float32Array; nextAt: number; src: ObsSource; targets: Float64Array } | null = null;
  readonly dt: number;
  private mj: MainModule;
  readonly sim: SimModel;

  constructor(mj: MainModule, sim: SimModel) {
    this.mj = mj;
    this.sim = sim;
    this.model = mj.MjModel.from_xml_string(sim.xml);
    this.data = new mj.MjData(this.model);
    this.dt = this.model.opt.timestep;
    const id = (type: number, name: string) => mj.mj_name2id(this.model, type, name);
    const BODY = mj.mjtObj.mjOBJ_BODY.value, JOINT = mj.mjtObj.mjOBJ_JOINT.value;
    this.bodyIds = sim.bodies.map((b) => id(BODY, b.name));
    const jids = sim.joints.map((j) => id(JOINT, j.name));
    this.jointQpos = jids.map((j) => this.model.jnt_qposadr[j]);
    this.jointDof = jids.map((j) => this.model.jnt_dofadr[j]);
    this.robots = sim.robots.map((r) => {
      const root = id(JOINT, r.root);
      return {
        key: r.key,
        rootQpos: root >= 0 ? this.model.jnt_qposadr[root] : -1,
        rootDof: root >= 0 ? this.model.jnt_dofadr[root] : -1,
        rootBody: id(BODY, r.root),
        floating: r.floating,
        joints: r.joints.map((jid) => sim.joints.findIndex((j) => j.id === jid)),
        startZ: 0,
        startXY: [0, 0] as [number, number],
      };
    });
    this.peaks = new Float64Array(sim.joints.length);
    this.saturated = new Float64Array(sim.joints.length);
    this.reset();
  }

  /** Back to the start: the canvas pose, just above the floor */
  reset(initial: RobotPoseState = this.sim.initial) {
    const { mj, model, data } = this;
    mj.mj_resetData(model, data);
    this.sim.joints.forEach((j, i) => {
      const v = initial.values[j.id];
      if (v !== undefined) data.qpos[this.jointQpos[i]] = j.type === 'revolute' ? v * D2R : v / 1000;
    });
    for (const r of this.robots) {
      if (r.rootQpos < 0) continue;
      const root = initial.roots?.[r.key];
      const p = root?.position;
      // Scene offset (mm, Y up) → MuJoCo (m, Z up)
      if (p) {
        data.qpos[r.rootQpos] += p[0] / 1000;
        data.qpos[r.rootQpos + 1] += -p[2] / 1000;
        data.qpos[r.rootQpos + 2] += p[1] / 1000;
      }
    }
    mj.mj_forward(model, data);
    for (const r of this.robots) {
      r.startZ = data.xpos[r.rootBody * 3 + 2];
      r.startXY = [data.xpos[r.rootBody * 3], data.xpos[r.rootBody * 3 + 1]];
    }
    this.peaks.fill(0);
    this.saturated.fill(0);
    this.fellAt.clear();
    this.push = null;
    this.grabbed = null;
    this.setController(this.controller);
  }

  setController(c: Controller) {
    this.controller = c;
    this.policyState = null;
    if (c.kind === 'policy') {
      const r = this.robots.find((x) => x.key === c.robot) ?? this.robots.find((x) => x.floating);
      const idx = c.policy.joints.map((id) => this.sim.joints.findIndex((j) => j.id === id));
      if (!r || r.rootQpos < 0 || idx.some((i) => i < 0)) throw new Error('This policy was trained on joints this robot no longer has. Train it again.');
      this.policyState = {
        action: new Float32Array(idx.length),
        obs: new Float32Array(obsSize(idx.length)),
        nextAt: this.data.time,
        src: { qpos: this.data.qpos, qvel: this.data.qvel, rootQpos: r.rootQpos, rootDof: r.rootDof, jointQpos: idx.map((i) => this.jointQpos[i]), jointDof: idx.map((i) => this.jointDof[i]) },
        targets: new Float64Array(idx.length),
      };
    }
  }

  /**
   * Grabs a body (index into SimModel.bodies) at a world point (MuJoCo frame, m): that point,
   * fixed to the body, is then pulled toward the hand (grabMove) on a critically damped spring
   * scaled by the robot's mass, with the robot's weight held at the point. The robot hangs and
   * swings from where it's held; a quick release flings it.
   */
  grabStart(body: number, point: [number, number, number]) {
    this.grabEnd();
    const id = this.bodyIds[body];
    if (id === undefined || id < 0) return;
    const { data } = this;
    const q = [data.xquat[id * 4], data.xquat[id * 4 + 1], data.xquat[id * 4 + 2], data.xquat[id * 4 + 3]];
    const rel = [point[0] - data.xpos[id * 3], point[1] - data.xpos[id * 3 + 1], point[2] - data.xpos[id * 3 + 2]];
    // The whole robot's mass: holding a foot lifts the robot
    let root = id;
    while (this.model.body_parentid[root] !== 0) root = this.model.body_parentid[root];
    this.grabbed = {
      body: id,
      local: rotate(conj(q), rel),
      target: point,
      startQuat: q,
      targetQuat: null,
      mass: Math.max(this.model.body_subtreemass[root], 0.05),
      last: null,
    };
  }

  /** Moves the hand: where the held point should be, and a turn since the grab (null = free to swing) */
  grabMove(point: [number, number, number], turn: [number, number, number, number] | null) {
    const g = this.grabbed;
    if (!g) return;
    g.target = point;
    g.targetQuat = turn ? quatMul(turn, g.startQuat) : null;
  }

  grabEnd() {
    if (this.grabbed) this.data.xfrc_applied.fill(0, this.grabbed.body * 6, this.grabbed.body * 6 + 6);
    this.grabbed = null;
  }

  private applyGrab() {
    const g = this.grabbed;
    if (!g) return;
    const { data } = this;
    const b = g.body;
    const q = [data.xquat[b * 4], data.xquat[b * 4 + 1], data.xquat[b * 4 + 2], data.xquat[b * 4 + 3]];
    const r = rotate(q, g.local);
    const p = [data.xpos[b * 3] + r[0], data.xpos[b * 3 + 1] + r[1], data.xpos[b * 3 + 2] + r[2]];
    const v = g.last ? p.map((x, i) => (x - g.last!.p[i]) / this.dt) : [0, 0, 0];
    const wn = 12;
    const zeta = 1;
    const cap = g.mass * 9.81 * 8;
    const f = [0, 1, 2].map((i) => {
      const spring = g.mass * (wn * wn * (g.target[i] - p[i]) - 2 * zeta * wn * v[i]);
      return Math.max(-cap, Math.min(cap, spring)) + (i === 2 ? g.mass * 9.81 : 0);
    });
    // xfrc_applied acts at the body's centre of mass: a force at the held point adds its moment
    const arm = [p[0] - data.xipos[b * 3], p[1] - data.xipos[b * 3 + 1], p[2] - data.xipos[b * 3 + 2]];
    const torque = [arm[1] * f[2] - arm[2] * f[1], arm[2] * f[0] - arm[0] * f[2], arm[0] * f[1] - arm[1] * f[0]];
    if (g.targetQuat) {
      // Turning the hand turns the body: rotation error as an axis-angle vector, damped by its spin
      const e = axisAngle(quatMul(g.targetQuat, conj(q)));
      const w = g.last ? axisAngle(quatMul(q, conj(g.last.q))).map((x) => x / this.dt) : [0, 0, 0];
      const inertia = g.mass * 0.05 * 0.05;
      for (let i = 0; i < 3; i++) torque[i] += inertia * (wn * wn * e[i] - 2 * zeta * wn * w[i]);
    }
    const xf = data.xfrc_applied;
    for (let i = 0; i < 3; i++) {
      xf[b * 6 + i] = f[i];
      xf[b * 6 + 3 + i] = torque[i];
    }
    g.last = { p, q };
  }

  /** Pushes a robot's root for `seconds` (force in newtons, scene axes) */
  pushRobot(key: string, force: [number, number, number], seconds = 0.15) {
    const r = this.robots.find((x) => x.key === key) ?? this.robots[0];
    if (!r) return;
    this.push = { body: r.rootBody, force: [force[0], -force[2], force[1]], until: this.data.time + seconds };
  }

  private targetFor(i: number, values: Record<string, number> | undefined): number | null {
    const j = this.sim.joints[i];
    const v = values?.[j.id] ?? this.sim.initial.values[j.id] ?? 0;
    return j.type === 'revolute' ? v * D2R : v / 1000;
  }

  private applyControl() {
    const { data } = this;
    const c = this.controller;
    const n = this.sim.joints.length;
    if (c.kind === 'limp') {
      for (let i = 0; i < n; i++) data.ctrl[i] = data.qpos[this.jointQpos[i]];
      return;
    }
    const values = c.kind === 'hold' ? c.values : c.kind === 'animation' ? sampleAnimation(c.animation, data.time).values : undefined;
    for (let i = 0; i < n; i++) data.ctrl[i] = this.targetFor(i, values) ?? 0;
    const ps = this.policyState;
    if (c.kind === 'policy' && ps) {
      if (data.time >= ps.nextAt - 1e-9) {
        // The arrays are live views into wasm memory; refresh them in case memory grew
        ps.src.qpos = data.qpos;
        ps.src.qvel = data.qvel;
        observe(ps.src, c.policy, ps.action, ps.obs);
        ps.action = act(c.policy, ps.obs);
        for (let k = 0; k < ps.action.length; k++) ps.targets[k] = c.policy.defaultPose[k] + c.policy.actionScale * ps.action[k];
        ps.nextAt += c.policy.controlDt;
      }
      c.policy.joints.forEach((id, k) => {
        const i = this.sim.joints.findIndex((j) => j.id === id);
        if (i >= 0) data.ctrl[i] = ps.targets[k];
      });
    }
  }

  /** Advances `seconds` of sim time */
  step(seconds: number) {
    const { mj, model, data } = this;
    const steps = Math.max(1, Math.round(seconds / this.dt));
    const n = this.sim.joints.length;
    for (let s = 0; s < steps; s++) {
      this.applyControl();
      const xf = data.xfrc_applied;
      if (this.push) {
        const b = this.push.body * 6;
        if (data.time < this.push.until) [xf[b], xf[b + 1], xf[b + 2]] = this.push.force;
        else {
          xf[b] = xf[b + 1] = xf[b + 2] = 0;
          this.push = null;
        }
      }
      this.applyGrab();
      mj.mj_step(model, data);
      const force = data.actuator_force;
      for (let i = 0; i < n; i++) {
        const u = Math.abs(force[i]) / this.sim.joints[i].effort;
        if (u > this.peaks[i]) this.peaks[i] = u;
        if (u >= 0.98) this.saturated[i] += this.dt;
      }
      this.checkFalls();
    }
  }

  private tiltOf(r: (typeof this.robots)[number]): number {
    // Angle between the root body's up axis and the world's
    const m = this.data.xmat;
    const zz = m[r.rootBody * 9 + 8];
    return Math.acos(Math.max(-1, Math.min(1, zz))) / D2R;
  }

  private checkFalls() {
    for (const r of this.robots) {
      if (!r.floating || this.fellAt.has(r.key)) continue;
      const z = this.data.xpos[r.rootBody * 3 + 2];
      if (this.tiltOf(r) > 60 || z < r.startZ * 0.45) this.fellAt.set(r.key, this.data.time);
    }
  }

  stats(rtf = 1): SimStats {
    const { data } = this;
    return {
      time: data.time,
      rtf,
      robots: this.robots.map((r) => {
        const x = data.xpos[r.rootBody * 3], y = data.xpos[r.rootBody * 3 + 1];
        return {
          key: r.key,
          fellAt: this.fellAt.get(r.key) ?? null,
          height: data.xpos[r.rootBody * 3 + 2] - r.startZ,
          tilt: this.tiltOf(r),
          travelled: Math.hypot(x - r.startXY[0], y - r.startXY[1]),
          forward: -(y - r.startXY[1]),
        };
      }),
      joints: this.sim.joints.map((j, i) => ({ id: j.id, peak: this.peaks[i], saturatedS: this.saturated[i] })),
    };
  }

  /** Body poses for the canvas: x, y, z, qw, qx, qy, qz per SimModel body (MuJoCo frame) */
  poses(out = new Float64Array(this.bodyIds.length * 7)): Float64Array {
    const { xpos, xquat } = this.data;
    this.bodyIds.forEach((b, i) => {
      out.set([xpos[b * 3], xpos[b * 3 + 1], xpos[b * 3 + 2], xquat[b * 4], xquat[b * 4 + 1], xquat[b * 4 + 2], xquat[b * 4 + 3]], i * 7);
    });
    return out;
  }

  dispose() {
    this.data.delete();
    this.model.delete();
  }
}
