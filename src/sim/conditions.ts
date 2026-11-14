import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';

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

interface Delay {
  steps: number;
  history: Float64Array[];
}

const SNAPSHOT = ['geom_friction', 'body_mass', 'body_inertia', 'actuator_forcerange'] as const;

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

export const liveConditions = (c: LiveConditions): Conditions => ({ ...c, masses: [c.mass] });

export const NOMINAL_CONDITIONS: Conditions = Object.freeze({ friction: 1, masses: [1], strength: 1, latencyMs: 0 });

export class ConditionedPhysics {
  readonly module: MainModule;
  private mj: MainModule;
  private delay: Delay = { steps: 0, history: [] };
  private baseline: Baseline | null = null;
  private dt = 0;

  constructor(mj: MainModule) {
    this.mj = mj;
    this.module = delayedModule(mj, this.delay);
  }

  attach(model: MjModel) {
    this.dt = model.opt.timestep;
    this.baseline = Object.fromEntries(
      SNAPSHOT.map((field) => [field, Float64Array.from(model[field] as ArrayLike<number>)]),
    ) as Baseline;
  }

  private restore(model: MjModel) {
    for (const field of SNAPSHOT) (model[field] as Float64Array).set(this.baseline![field]);
  }

  apply(model: MjModel, data: MjData, conditions: Conditions) {
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

    this.mj.mj_setConst(model, data);
    this.delay.steps = Math.round(conditions.latencyMs / 1000 / this.dt);
    this.delay.history = [];
  }

  clearDelay() {
    this.delay.history = [];
  }

  reading(model: MjModel): LiveConditions {
    const base = this.baseline!;

    return {
      friction: ratio(model.geom_friction, base.geom_friction, 3),
      mass: ratio(model.body_mass, base.body_mass),
      strength: ratio(model.actuator_forcerange, base.actuator_forcerange),
      latencyMs: Number((this.delay.steps * this.dt * 1000).toFixed(3)),
    };
  }
}
