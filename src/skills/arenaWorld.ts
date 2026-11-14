import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { SimEngine, type Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotPoseState } from '../types/robotics';
import type { Range, ServoSpread } from './environment';
import { sha256Hex } from './hash';
import { drawServos, type ServoDraw } from './servoDraws';
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
  servos?: ServoSpread[];
}

export interface Instance {
  friction: number;
  masses: number[];
  strength: number;
  latencyMs: number;
  jointNoise: number[];
  yawDeg: number;
  offsetMm: [number, number];
  servos?: Record<string, ServoDraw>;
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
    servos: drawServos(ranges.servos, random),
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
  own: number[];
}

function ownDelays(late: Float64Array, now: ArrayLike<number>, own: number[]): Float64Array {
  const mixed = Float64Array.from(late);

  for (const a of own) mixed[a] = now[a];

  return mixed;
}

function delayedModule(mj: MainModule, delay: Delay): MainModule {
  const step = (model: MjModel, data: MjData) => {
    if (delay.steps > 0) {
      delay.history.push(Float64Array.from(data.ctrl));

      const late = delay.history.length > delay.steps ? delay.history.shift()! : delay.history[0];

      data.ctrl.set(delay.own.length ? ownDelays(late, data.ctrl, delay.own) : late);
    }

    mj.mj_step(model, data);
  };

  return Object.create(mj, { mj_step: { value: step } }) as MainModule;
}

const SNAPSHOT = [
  'geom_friction',
  'body_mass',
  'body_inertia',
  'actuator_forcerange',
  'actuator_gainprm',
  'actuator_biasprm',
  'actuator_delay',
  'dof_damping',
  'dof_armature',
  'dof_frictionloss',
] as const;

interface ServoSlot {
  actuator: number;
  dof: number;
}

const GAIN_WIDTH = 10;
const DIVERGENCE = ['mjWARN_BADQPOS', 'mjWARN_BADQVEL', 'mjWARN_BADQACC'] as const;

export class ArenaWorld {
  readonly engine: SimEngine;
  private mj: MainModule;
  private delay: Delay = { steps: 0, history: [], own: [] };
  private baseline: Record<(typeof SNAPSHOT)[number], Float64Array>;
  private slots: Map<string, ServoSlot>;

  constructor(mj: MainModule, model: SimModel) {
    this.mj = mj;
    this.engine = new SimEngine(delayedModule(mj, this.delay), model);
    this.engine.model.opt.disableflags |= mj.mjtDisableBit.mjDSBL_AUTORESET.value;
    this.baseline = Object.fromEntries(
      SNAPSHOT.map((field) => [field, Float64Array.from(this.engine.model[field] as ArrayLike<number>)]),
    ) as ArenaWorld['baseline'];
    this.slots = new Map(
      this.engine.sim.joints.map((j) => {
        const id = mj.mj_name2id(this.engine.model, mj.mjtObj.mjOBJ_JOINT.value, j.name);

        return [j.id, { actuator: j.actuator, dof: this.engine.model.jnt_dofadr[id] }];
      }),
    );
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

    for (const [joint, draw] of Object.entries(instance.servos ?? {})) this.drawServo(this.slots.get(joint), draw);
  }

  private drawServo(slot: ServoSlot | undefined, draw: ServoDraw) {
    if (!slot) return;

    const { model } = this.engine;
    const { actuator: a, dof } = slot;
    const forcerange = model.actuator_forcerange as Float64Array;
    const base = this.baseline.actuator_forcerange;

    (model.actuator_gainprm as Float64Array)[a * GAIN_WIDTH] *= draw.kp;
    (model.actuator_biasprm as Float64Array)[a * GAIN_WIDTH + 1] *= draw.kp;
    forcerange[2 * a] = base[2 * a] * draw.forceNm;
    forcerange[2 * a + 1] = base[2 * a + 1] * draw.forceNm;
    (model.actuator_delay as Float64Array)[a] *= draw.delayS;
    (model.dof_damping as Float64Array)[dof] *= draw.damping;
    (model.dof_armature as Float64Array)[dof] *= draw.armature;
    (model.dof_frictionloss as Float64Array)[dof] *= draw.frictionloss;
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
    this.delay.own = Object.keys(instance.servos ?? {}).flatMap((j) => {
      const slot = this.slots.get(j);

      return slot ? [slot.actuator] : [];
    });
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
