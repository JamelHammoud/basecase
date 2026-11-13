import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { SimEngine, type Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotPoseState } from '../types/robotics';
import type { Range } from './environment';
import { sha256Hex } from './hash';
import type { Random } from '../utils/seededRandom';

export { seededRandom, type Random } from '../utils/seededRandom';

export interface ArenaRanges {
  friction: Range;
  mass: Range;
  strength: Range;
  latencyMs: Range;
  jointNoiseDeg: number;
  baseYawDeg: number;
  baseOffsetMm: number;
}

export interface Instance {
  friction: number;
  masses: number[];
  strength: number;
  latencyMs: number;
  jointNoise: number[];
  yawDeg: number;
  offsetMm: [number, number];
}

const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export const trialSeed = (options: { salt: Uint8Array; variant: string; trial: number; environment: string }) =>
  sha256Hex(`arena|${toHex(options.salt)}|${options.variant}|${options.trial}|${options.environment}`);

const within = (random: Random, [lo, hi]: Range) => lo + (hi - lo) * random();
const symmetric = (random: Random, size: number) => (2 * random() - 1) * size;

export function drawInstance(random: Random, options: { ranges: ArenaRanges; bodies: number; joints: number }) {
  const { ranges, bodies, joints } = options;

  return {
    friction: within(random, ranges.friction),
    masses: Array.from({ length: bodies }, () => within(random, ranges.mass)),
    strength: within(random, ranges.strength),
    latencyMs: within(random, ranges.latencyMs),
    jointNoise: Array.from({ length: joints }, () => symmetric(random, ranges.jointNoiseDeg)),
    yawDeg: symmetric(random, ranges.baseYawDeg),
    offsetMm: [symmetric(random, ranges.baseOffsetMm), symmetric(random, ranges.baseOffsetMm)],
  } satisfies Instance;
}

export function withTimestep(model: SimModel, factor: number): SimModel {
  const xml = model.xml.replace(/timestep="([^"]+)"/, (_, dt: string) => `timestep="${Number(dt) * factor}"`);

  if (xml === model.xml) throw new Error('The model has no timestep to change.');

  return { ...model, xml };
}

interface Delay {
  steps: number;
  history: Float64Array[];
}

function delayedModule(mj: MainModule, delay: Delay): MainModule {
  const step = (model: MjModel, data: MjData) => {
    if (delay.steps > 0) {
      delay.history.push(Float64Array.from(data.ctrl));

      const late = delay.history.length > delay.steps ? delay.history.shift()! : delay.history[0];

      data.ctrl.set(late);
    }

    mj.mj_step(model, data);
  };

  return Object.create(mj, { mj_step: { value: step } }) as MainModule;
}

const SNAPSHOT = ['geom_friction', 'body_mass', 'body_inertia', 'actuator_forcerange'] as const;
const DIVERGENCE = ['mjWARN_BADQPOS', 'mjWARN_BADQVEL', 'mjWARN_BADQACC'] as const;

export class ArenaWorld {
  readonly engine: SimEngine;
  private mj: MainModule;
  private delay: Delay = { steps: 0, history: [] };
  private baseline: Record<(typeof SNAPSHOT)[number], Float64Array>;

  constructor(mj: MainModule, model: SimModel) {
    this.mj = mj;
    this.engine = new SimEngine(delayedModule(mj, this.delay), model);
    this.engine.model.opt.disableflags |= mj.mjtDisableBit.mjDSBL_AUTORESET.value;
    this.baseline = Object.fromEntries(
      SNAPSHOT.map((field) => [field, Float64Array.from(this.engine.model[field] as ArrayLike<number>)]),
    ) as ArenaWorld['baseline'];
  }

  private restore() {
    for (const field of SNAPSHOT) (this.engine.model[field] as Float64Array).set(this.baseline[field]);
  }

  private scale(instance: Instance) {
    const { model } = this.engine;
    const friction = model.geom_friction as Float64Array;
    const forcerange = model.actuator_forcerange as Float64Array;

    for (let g = 0; g < model.ngeom; g++) friction[g * 3] *= instance.friction;

    for (let b = 1; b < model.nbody; b++) {
      const s = instance.masses[(b - 1) % instance.masses.length];

      model.body_mass[b] *= s;

      for (let k = 0; k < 3; k++) model.body_inertia[b * 3 + k] *= s;
    }

    for (let i = 0; i < forcerange.length; i++) forcerange[i] *= instance.strength;
  }

  private startPose(base: RobotPoseState, instance: Instance, robot: string): RobotPoseState {
    const values = { ...base.values };

    this.engine.sim.joints.forEach((j, i) => {
      if (j.robot !== robot) return;

      const [lo, hi] = j.range ?? [-Infinity, Infinity];

      values[j.id] = Math.max(lo, Math.min(hi, (values[j.id] ?? 0) + (instance.jointNoise[i] ?? 0)));
    });

    const root = base.roots?.[robot];
    const p = root?.position ?? [0, 0, 0];
    const position: [number, number, number] = [p[0] + instance.offsetMm[0], p[1], p[2] + instance.offsetMm[1]];

    return { ...base, values, roots: { ...base.roots, [robot]: { ...root, position } } };
  }

  private turn(robot: string, yawDeg: number) {
    const { mj, engine } = this;
    const key = engine.sim.robots.find((r) => r.key === robot);
    const id = key?.floating ? mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, key.root) : -1;

    if (id < 0 || !yawDeg) return;

    const at = engine.model.jnt_qposadr[id] + 3;
    const half = (yawDeg * Math.PI) / 360;
    const [cw, sw] = [Math.cos(half), Math.sin(half)];
    const q = engine.data.qpos;
    const [w, x, y, z] = [q[at], q[at + 1], q[at + 2], q[at + 3]];

    q.set([cw * w - sw * z, cw * x - sw * y, cw * y + sw * x, cw * z + sw * w], at);
    mj.mj_forward(engine.model, engine.data);
  }

  prepare(options: { instance: Instance; controller: Controller; start: RobotPoseState; robot: string }) {
    const { instance, controller, start, robot } = options;
    const { engine, mj } = this;

    engine.setController({ kind: 'hold' });
    this.restore();
    this.scale(instance);
    mj.mj_setConst(engine.model, engine.data);
    this.delay.steps = Math.round(instance.latencyMs / 1000 / engine.dt);
    this.delay.history = [];
    engine.setController(controller);
    engine.reset(this.startPose(start, instance, robot));
    this.turn(robot, instance.yawDeg);
  }

  diverged(): boolean {
    const { mj, engine } = this;

    return DIVERGENCE.some((name) => {
      const stat = engine.data.warning.get(mj.mjtWarning[name].value);
      const count = stat?.number ?? 0;

      stat?.delete();

      return count > 0;
    });
  }

  dispose() {
    this.engine.dispose();
  }
}
