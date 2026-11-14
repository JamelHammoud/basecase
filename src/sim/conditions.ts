import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { DYNAMICS_TERMS } from './servoModel';

export interface Conditions {
  friction: number;
  masses: number[];
  strength: number;
  latencyMs: number;
}

export interface LiveConditions {
  friction: number;
  mass: number;
  strength: number;
  latencyMs: number;
}

export interface ServoScale {
  actuator: number;
  dof: number;
  draw: Record<(typeof DYNAMICS_TERMS)[number], number>;
}

interface Delay {
  steps: number;
  history: Float64Array[];
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

const GAIN_WIDTH = 10;

type Baseline = Record<(typeof SNAPSHOT)[number], Float64Array>;

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

const ratio = (now: ArrayLike<number>, base: Float64Array, stride = 1) => {
  for (let i = 0; i < base.length; i += stride) if (base[i] !== 0) return Number((now[i] / base[i]).toFixed(4));

  return 1;
};

function scaleServo(model: MjModel, { actuator: a, dof, draw }: ServoScale) {
  const forcerange = model.actuator_forcerange as Float64Array;

  (model.actuator_gainprm as Float64Array)[a * GAIN_WIDTH] *= draw.kp;
  (model.actuator_biasprm as Float64Array)[a * GAIN_WIDTH + 1] *= draw.kp;
  forcerange[2 * a] *= draw.forceNm;
  forcerange[2 * a + 1] *= draw.forceNm;
  (model.actuator_delay as Float64Array)[a] *= draw.delayS;
  (model.dof_damping as Float64Array)[dof] *= draw.damping;
  (model.dof_armature as Float64Array)[dof] *= draw.armature;
  (model.dof_frictionloss as Float64Array)[dof] *= draw.frictionloss;
}

const liveConditions = (c: LiveConditions): Conditions => ({ ...c, masses: [c.mass] });

const NOMINAL_CONDITIONS: Conditions = Object.freeze({ friction: 1, masses: [1], strength: 1, latencyMs: 0 });

export class ConditionedPhysics {
  readonly module: MainModule;
  private mj: MainModule;
  private delay: Delay = { steps: 0, history: [] };
  private baseline: Baseline | null = null;
  private dt = 0;
  private live = false;
  private strength = 1;
  private applied: () => void = () => {};

  constructor(mj: MainModule) {
    this.mj = mj;
    this.module = delayedModule(mj, this.delay);
  }

  attach(model: MjModel, applied: () => void) {
    this.applied = applied;
    this.dt = model.opt.timestep;
    this.baseline = Object.fromEntries(
      SNAPSHOT.map((field) => [field, Float64Array.from(model[field] as ArrayLike<number>)]),
    ) as Baseline;
  }

  private restore(model: MjModel) {
    for (const field of SNAPSHOT) (model[field] as Float64Array).set(this.baseline![field]);
  }

  apply(model: MjModel, data: MjData, conditions: Conditions, servos: readonly ServoScale[] = []) {
    const friction = model.geom_friction as Float64Array;
    const forcerange = model.actuator_forcerange as Float64Array;

    this.restore(model);

    for (let g = 0; g < model.ngeom; g++) friction[g * 3] *= conditions.friction;

    for (let b = 1; b < model.nbody; b++) {
      const s = conditions.masses[(b - 1) % conditions.masses.length];

      model.body_mass[b] *= s;

      for (let k = 0; k < 3; k++) model.body_inertia[b * 3 + k] *= s;
    }

    for (let i = 0; i < forcerange.length; i++) forcerange[i] *= conditions.strength;

    for (const servo of servos) scaleServo(model, servo);

    this.applied();
    this.strength = conditions.strength;
    this.mj.mj_setConst(model, data);
    this.delay.steps = Math.round(conditions.latencyMs / 1000 / this.dt);
    this.delay.history = [];
  }

  get conditioned() {
    return this.live;
  }

  set(model: MjModel, data: MjData, conditions: LiveConditions | null): boolean {
    if (!conditions && !this.live) return false;

    this.apply(model, data, conditions ? liveConditions(conditions) : NOMINAL_CONDITIONS);
    this.live = !!conditions;

    return true;
  }

  clearDelay() {
    this.delay.history = [];
  }

  reading(model: MjModel): LiveConditions {
    const base = this.baseline!;

    return {
      friction: ratio(model.geom_friction, base.geom_friction, 3),
      mass: ratio(model.body_mass, base.body_mass),
      strength: this.strength,
      latencyMs: Number((this.delay.steps * this.dt * 1000).toFixed(3)),
    };
  }
}
