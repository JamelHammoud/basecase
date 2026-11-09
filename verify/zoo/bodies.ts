import type { MainModule } from '@mujoco/mujoco';
import { signalReaders, type SignalReader } from '../../src/skills/arenaSignals';
import type { Trace } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { SimEngine } from '../../src/sim/engine';
import type { SimModel } from '../../src/sim/mjcfTypes';
import type { V3 } from './formula';

export type BodyClass = 'arm' | 'wheels' | 'legs';

export interface ZooBody {
  id: string;
  cls: BodyClass;
  model: SimModel;
  rootPart: string;
  tip: string | null;
  feet: string[];
  waveJoint: string;
}

const BODY_SPECS: Array<Omit<ZooBody, 'model'>> = [
  { id: 'arm-3dof', cls: 'arm', rootPart: 'base', tip: 'link2', feet: [], waveJoint: 'arm0' },
  { id: 'arm-6dof', cls: 'arm', rootPart: 'base', tip: 'link5', feet: [], waveJoint: 'arm0' },
  { id: 'rover-diff', cls: 'wheels', rootPart: 'chassis', tip: null, feet: [], waveJoint: 'left_wheel' },
  {
    id: 'quad-servo',
    cls: 'legs',
    rootPart: 'body',
    tip: null,
    feet: ['leg0_lower', 'leg1_lower', 'leg2_lower', 'leg3_lower'],
    waveJoint: 'leg0_swing',
  },
  {
    id: 'hexapod',
    cls: 'legs',
    rootPart: 'body',
    tip: null,
    feet: ['leg0_lower', 'leg1_lower', 'leg2_lower', 'leg3_lower', 'leg4_lower', 'leg5_lower'],
    waveJoint: 'leg0_swing',
  },
  { id: 'biped-servo', cls: 'legs', rootPart: 'body', tip: null, feet: ['l_sole', 'r_sole'], waveJoint: 'l_pitch' },
];

export const ZOO_BODY_IDS = Object.freeze(BODY_SPECS.map((b) => b.id));

export const zooBody = (id: string): ZooBody => {
  const spec = BODY_SPECS.find((b) => b.id === id);

  if (!spec) throw new Error(`No zoo body ${id}`);

  return { ...spec, model: fixtureModel(id) };
};

export interface Pose {
  forward?: number;
  right?: number;
  up?: number;
  tilt?: number;
  joints?: Record<string, number>;
}

const D2R = Math.PI / 180;
const SETTLE_S = 2;
const SETTLED_TILT = 0.3;

const QUAT_MUL = (a: number[], b: number[]) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

export class Poser {
  readonly engine: SimEngine;
  readonly body: ZooBody;
  readonly rest: Float64Array;
  private readonly mj: MainModule;
  private readonly rootAdr: number | null;
  private readonly rootBody: number;

  constructor(mj: MainModule, body: ZooBody) {
    this.mj = mj;
    this.body = body;
    this.engine = new SimEngine(mj, body.model);

    const robot = body.model.robots[0];

    this.rootBody = mj.mj_name2id(this.engine.model, mj.mjtObj.mjOBJ_BODY.value, robot.root);
    this.rootAdr = robot.floating ? this.jointAdr(robot.root) : null;
    this.rest = this.settle();
  }

  private jointAdr(name: string): number {
    const id = this.mj.mj_name2id(this.engine.model, this.mj.mjtObj.mjOBJ_JOINT.value, name);

    if (id < 0) throw new Error(`The ${this.body.id} model has no joint ${name}`);

    return this.engine.model.jnt_qposadr[id];
  }

  private settle(): Float64Array {
    const initial = Float64Array.from(this.engine.data.qpos);

    if (this.rootAdr === null) return initial;

    this.engine.setController({ kind: 'hold' });
    this.engine.step(SETTLE_S);

    const tilt = Math.acos(Math.max(-1, Math.min(1, this.engine.data.xmat[this.rootBody * 9 + 8])));

    return tilt < SETTLED_TILT ? Float64Array.from(this.engine.data.qpos) : initial;
  }

  qpos(pose: Pose): Float64Array {
    const q = Float64Array.from(this.rest);
    const at = this.rootAdr;

    if (at !== null) {
      q[at] -= pose.right ?? 0;
      q[at + 1] -= pose.forward ?? 0;
      q[at + 2] += pose.up ?? 0;

      const half = (pose.tilt ?? 0) / 2;
      const turned = QUAT_MUL([Math.cos(half), Math.sin(half), 0, 0], Array.from(q.subarray(at + 3, at + 7)));

      q.set(turned, at + 3);
    }

    for (const [id, deg] of Object.entries(pose.joints ?? {})) {
      const joint = this.body.model.joints.find((j) => j.id === id);

      if (!joint) throw new Error(`The ${this.body.id} model has no joint ${id}`);

      q[this.jointAdr(joint.name)] += deg * D2R;
    }

    return q;
  }

  restJointDeg(id: string): number {
    const joint = this.body.model.joints.find((j) => j.id === id);

    if (!joint) throw new Error(`The ${this.body.id} model has no joint ${id}`);

    return this.rest[this.jointAdr(joint.name)] / D2R;
  }

  readers(signals: Record<string, SignalSource>): Record<string, SignalReader> {
    return signalReaders({ mj: this.mj, engine: this.engine, robot: this.body.model.robots[0].key }, signals);
  }

  trace(frames: Float64Array[], dt: number, signals: Record<string, SignalSource>): Trace {
    const readers = this.readers(signals);
    const out: Record<string, number[]> = Object.fromEntries(Object.keys(readers).map((n) => [n, []]));

    frames.forEach((q, i) => {
      this.engine.setState(q);
      this.engine.data.time = i * dt;

      for (const [name, read] of Object.entries(readers)) out[name].push(read());
    });

    return { dt, signals: out };
  }

  rootAt(pose: Pose = {}): V3 {
    this.engine.setState(this.qpos(pose));

    const { xpos } = this.engine.data;

    return [xpos[this.rootBody * 3], xpos[this.rootBody * 3 + 1], xpos[this.rootBody * 3 + 2]];
  }

  partAt(part: string, pose: Pose = {}): V3 {
    this.engine.setState(this.qpos(pose));

    const body = this.engine.sim.bodies.find((b) => b.parts.includes(part));

    if (!body) throw new Error(`The ${this.body.id} model has no part ${part}`);

    const id = this.mj.mj_name2id(this.engine.model, this.mj.mjtObj.mjOBJ_BODY.value, body.name);
    const { xpos } = this.engine.data;

    return [xpos[id * 3], xpos[id * 3 + 1], xpos[id * 3 + 2]];
  }

  dispose() {
    this.engine.dispose();
  }
}
