import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { RobotAnimation, RobotPoseState } from '../types/robotics';
import { sampleAnimation } from '../utils/animation';
import { primeCtrlHistory } from './ctrlHistory';
import { createDrive, type DriveCommand, type DriveLoop, type DriveSetup } from './drive';
import { GrabForce } from './grabForce';
import type { SimModel } from './mjcf';
import { act, observe, obsSize, type ObsSource, type PolicySpec } from './policy';

export type Controller =
  | { kind: 'hold'; values?: Record<string, number> }
  | { kind: 'animation'; animation: RobotAnimation }
  | { kind: 'policy'; policy: PolicySpec; robot: string }
  | { kind: 'drive'; setup: DriveSetup }
  | { kind: 'limp' };

export interface JointStat {
  id: string;
  peak: number;
  saturatedS: number;
}

export interface RobotStat {
  key: string;
  fellAt: number | null;
  height: number;
  tilt: number;
  travelled: number;
  forward: number;
  speed: number;
}

export interface SimStats {
  time: number;
  robots: RobotStat[];
  joints: JointStat[];
  rtf: number;
}

const D2R = Math.PI / 180;

const jointQposOf = (type: 'revolute' | 'prismatic', v: number) => (type === 'revolute' ? v * D2R : v / 1000);

function controlValues(c: Controller, time: number): Record<string, number> | undefined {
  if (c.kind === 'hold') return c.values;

  if (c.kind === 'animation') return sampleAnimation(c.animation, time).values;

  return undefined;
}

export class SimEngine {
  readonly model: MjModel;
  readonly data: MjData;
  private bodyIds: number[];
  private jointQpos: number[];
  private jointDof: number[];
  private robots: Array<{
    key: string;
    rootQpos: number;
    rootDof: number;
    rootBody: number;
    floating: boolean;
    joints: number[];
    startZ: number;
    startXY: [number, number];
  }>;
  private controller: Controller = { kind: 'hold' };
  private drive: DriveLoop | null = null;
  stepHook: (() => void) | null = null;
  private peaks: Float64Array;
  private saturated: Float64Array;
  private fellAt = new Map<string, number>();
  private push: { body: number; force: [number, number, number]; until: number } | null = null;
  private grab: GrabForce;
  private heldRange: ArrayLike<number> | null = null;
  private policyState: {
    action: Float32Array;
    obs: Float32Array;
    nextAt: number;
    src: ObsSource;
    targets: Float64Array;
  } | null = null;
  readonly dt: number;
  private mj: MainModule;
  readonly sim: SimModel;

  constructor(mj: MainModule, sim: SimModel) {
    this.mj = mj;
    this.sim = sim;
    this.model = mj.MjModel.from_xml_string(sim.xml);
    this.data = new mj.MjData(this.model);
    this.dt = this.model.opt.timestep;
    this.grab = new GrabForce(this.model, this.data, this.dt);

    const id = (type: number, name: string) => mj.mj_name2id(this.model, type, name);
    const BODY = mj.mjtObj.mjOBJ_BODY.value,
      JOINT = mj.mjtObj.mjOBJ_JOINT.value;

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

  reset(initial: RobotPoseState = this.sim.initial) {
    const { mj, model, data } = this;

    mj.mj_resetData(model, data);
    this.sim.joints.forEach((j, i) => {
      const v = initial.values[j.id];

      if (v !== undefined) data.qpos[this.jointQpos[i]] = jointQposOf(j.type, v);
    });

    for (const r of this.robots) this.placeRoot(r, initial);

    mj.mj_forward(model, data);
    this.holdDelayedControls(this.sim.joints.map((_, i) => i));

    for (const r of this.robots) {
      r.startZ = data.xpos[r.rootBody * 3 + 2];
      r.startXY = [data.xpos[r.rootBody * 3], data.xpos[r.rootBody * 3 + 1]];
    }

    this.peaks.fill(0);
    this.saturated.fill(0);
    this.fellAt.clear();
    this.push = null;
    this.grab.forget();
    this.setController(this.controller);
  }

  private placeRoot(r: SimEngine['robots'][number], initial: RobotPoseState) {
    const p = r.rootQpos >= 0 ? initial.roots?.[r.key]?.position : null;

    if (!p) return;

    this.data.qpos[r.rootQpos] += p[0] / 1000;
    this.data.qpos[r.rootQpos + 1] += -p[2] / 1000;
    this.data.qpos[r.rootQpos + 2] += p[1] / 1000;
  }

  respawn(key?: string) {
    const r = this.robots.find((x) => x.key === key) ?? this.robots[0];

    if (!r) return;

    const { mj, model, data } = this;

    r.joints.forEach((i) => {
      const j = this.sim.joints[i];
      const v = this.sim.initial.values[j.id];
      const at = this.jointQpos[i];

      data.qpos[at] = v === undefined ? model.qpos0[at] : jointQposOf(j.type, v);
      data.qvel[this.jointDof[i]] = 0;
    });

    if (r.rootQpos >= 0) {
      for (let k = 0; k < 7; k++) data.qpos[r.rootQpos + k] = model.qpos0[r.rootQpos + k];

      for (let k = 0; k < 6; k++) data.qvel[r.rootDof + k] = 0;

      this.placeRoot(r, this.sim.initial);
    }

    this.fellAt.delete(r.key);
    this.push = null;
    this.grab.forget();
    this.setController(this.controller);
    mj.mj_forward(model, data);
    this.holdDelayedControls(r.joints);
  }

  private holdDelayedControls(joints: number[]) {
    const held = joints.flatMap((i) => {
      const j = this.sim.joints[i];

      if (j.actuator < 0) return [];

      return [{ actuator: j.actuator, value: j.drive === 'position' ? this.data.qpos[this.jointQpos[i]] : 0 }];
    });

    primeCtrlHistory(this.mj, this.model, this.data, held);
  }

  setController(c: Controller) {
    this.controller = c;
    this.policyState = null;
    this.drive = c.kind === 'drive' ? createDrive(c.setup) : null;
    this.setLimp(c.kind === 'limp');

    if (c.kind !== 'policy') return;

    const r = this.robots.find((x) => x.key === c.robot) ?? this.robots.find((x) => x.floating);
    const idx = c.policy.joints.map((id) => this.sim.joints.findIndex((j) => j.id === id));

    if (!r || r.rootQpos < 0 || idx.some((i) => i < 0))
      throw new Error('This policy was trained on joints this robot no longer has. Train it again.');

    this.policyState = {
      action: new Float32Array(idx.length),
      obs: new Float32Array(obsSize(idx.length)),
      nextAt: this.data.time,
      src: {
        qpos: this.data.qpos,
        qvel: this.data.qvel,
        rootQpos: r.rootQpos,
        rootDof: r.rootDof,
        jointQpos: idx.map((i) => this.jointQpos[i]),
        jointDof: idx.map((i) => this.jointDof[i]),
      },
      targets: new Float64Array(idx.length),
    };
  }

  command(c: DriveCommand) {
    this.drive?.command(c);
  }

  grabStart(body: number, point: [number, number, number]) {
    this.grabEnd();

    const id = this.bodyIds[body];

    if (id === undefined || id < 0) return;

    this.grab.start(id, point);
  }

  grabMove(point: [number, number, number], turn: [number, number, number, number] | null) {
    this.grab.move(point, turn);
  }

  grabEnd() {
    this.grab.end();
  }

  pushRobot(key: string, force: [number, number, number], seconds = 0.15) {
    const r = this.robots.find((x) => x.key === key) ?? this.robots[0];

    if (!r) return;

    this.push = { body: r.rootBody, force: [force[0], -force[2], force[1]], until: this.data.time + seconds };
  }

  private targetFor(i: number, values: Record<string, number> | undefined): number {
    const j = this.sim.joints[i];

    if (j.drive === 'velocity') return 0;

    return jointQposOf(j.type, values?.[j.id] ?? this.sim.initial.values[j.id] ?? 0);
  }

  private setLimp(limp: boolean) {
    const range = this.model.actuator_forcerange;

    if (limp && !this.heldRange) {
      this.heldRange = range.slice();
      range.fill(0);
    } else if (!limp && this.heldRange) {
      range.set(this.heldRange);
      this.heldRange = null;
    }
  }

  private applyControl() {
    const { data } = this;
    const c = this.controller;

    if (c.kind === 'limp') return;

    if (this.drive) {
      this.applyDrive(this.drive);

      return;
    }

    const values = controlValues(c, data.time);

    this.sim.joints.forEach((j, i) => {
      if (j.actuator >= 0) data.ctrl[j.actuator] = this.targetFor(i, values);
    });

    const ps = this.policyState;

    if (c.kind === 'policy' && ps) this.applyPolicy(c.policy, ps);
  }

  private applyDrive(drive: DriveLoop) {
    const { values, wheels } = drive.tick(this.data.time);

    this.sim.joints.forEach((j, i) => {
      if (j.actuator < 0) return;

      this.data.ctrl[j.actuator] = j.drive === 'velocity' ? (wheels?.[j.id] ?? 0) : this.targetFor(i, values);
    });
  }

  private applyPolicy(policy: PolicySpec, ps: NonNullable<SimEngine['policyState']>) {
    const { data } = this;

    if (data.time >= ps.nextAt - 1e-9) {
      ps.src.qpos = data.qpos;
      ps.src.qvel = data.qvel;
      observe(ps.src, policy, ps.action, ps.obs);
      ps.action = act(policy, ps.obs);

      for (let k = 0; k < ps.action.length; k++)
        ps.targets[k] = policy.defaultPose[k] + policy.actionScale * ps.action[k];

      ps.nextAt += policy.controlDt;
    }

    policy.joints.forEach((id, k) => {
      const actuator = this.sim.joints.find((j) => j.id === id)?.actuator ?? -1;

      if (actuator >= 0) data.ctrl[actuator] = ps.targets[k];
    });
  }

  private applyPush() {
    if (!this.push) return;

    const xf = this.data.xfrc_applied;
    const b = this.push.body * 6;

    if (this.data.time < this.push.until) [xf[b], xf[b + 1], xf[b + 2]] = this.push.force;
    else {
      xf[b] = xf[b + 1] = xf[b + 2] = 0;
      this.push = null;
    }
  }

  step(seconds: number, afterStep?: () => void) {
    const { mj, model, data } = this;
    const steps = Math.max(1, Math.round(seconds / this.dt));
    const { joints } = this.sim;
    const n = joints.length;

    for (let s = 0; s < steps; s++) {
      this.applyControl();
      this.applyPush();
      this.grab.apply();
      mj.mj_step(model, data);
      afterStep?.();
      this.stepHook?.();

      const force = data.actuator_force;

      for (let i = 0; i < n; i++) {
        const actuator = joints[i].actuator;
        const u = actuator >= 0 ? Math.abs(force[actuator]) / joints[i].effort : 0;

        if (u > this.peaks[i]) this.peaks[i] = u;

        if (u >= 0.98) this.saturated[i] += this.dt;
      }

      this.checkFalls();
    }
  }

  private tiltOf(r: (typeof this.robots)[number]): number {
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
        const x = data.xpos[r.rootBody * 3],
          y = data.xpos[r.rootBody * 3 + 1];

        return {
          key: r.key,
          fellAt: this.fellAt.get(r.key) ?? null,
          height: data.xpos[r.rootBody * 3 + 2] - r.startZ,
          tilt: this.tiltOf(r),
          travelled: Math.hypot(x - r.startXY[0], y - r.startXY[1]),
          forward: -(y - r.startXY[1]),
          speed: r.rootDof >= 0 ? Math.hypot(data.qvel[r.rootDof], data.qvel[r.rootDof + 1]) : 0,
        };
      }),
      joints: this.sim.joints.map((j, i) => ({ id: j.id, peak: this.peaks[i], saturatedS: this.saturated[i] })),
    };
  }

  refreshKinematics() {
    this.mj.mj_kinematics(this.model, this.data);
  }

  setState(qpos: ArrayLike<number>) {
    this.data.qpos.set(qpos);
    this.data.qvel.fill(0);
    this.mj.mj_forward(this.model, this.data);
  }

  poses(out = new Float64Array(this.bodyIds.length * 7)): Float64Array {
    const { xpos, xquat } = this.data;

    this.bodyIds.forEach((b, i) => {
      out.set(
        [
          xpos[b * 3],
          xpos[b * 3 + 1],
          xpos[b * 3 + 2],
          xquat[b * 4],
          xquat[b * 4 + 1],
          xquat[b * 4 + 2],
          xquat[b * 4 + 3],
        ],
        i * 7,
      );
    });

    return out;
  }

  dispose() {
    this.data.delete();
    this.model.delete();
  }
}
