import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';

export interface SimConditions {
  friction: number;
  mass: number;
  strength: number;
  latencyMs: number;
}

const FIELDS = ['geom_friction', 'body_mass', 'body_inertia', 'actuator_forcerange'] as const;

type Field = (typeof FIELDS)[number];

type Baseline = Record<Field, Float64Array>;

const rounded = (v: number) => Math.round(v * 1e6) / 1e6;

function ratio(now: ArrayLike<number>, base: Float64Array, { from, step }: { from: number; step: number }) {
  for (let i = from; i < base.length; i += step) if (base[i] !== 0) return rounded(now[i] / base[i]);

  return 1;
}

export class LiveConditions {
  private mj: MainModule;
  private model: MjModel;
  private data: MjData;
  private baseline: Baseline | null = null;
  private applied: SimConditions | null = null;
  private steps = 0;
  private history: Float64Array[] = [];

  constructor(mj: MainModule, model: MjModel, data: MjData) {
    this.mj = mj;
    this.model = model;
    this.data = data;
  }

  private array(field: Field) {
    return this.model[field] as Float64Array;
  }

  apply(conditions: SimConditions | null) {
    const { mj, model, data } = this;

    this.baseline ??= Object.fromEntries(FIELDS.map((f) => [f, Float64Array.from(this.array(f))])) as Baseline;

    for (const field of FIELDS) this.array(field).set(this.baseline[field]);

    this.applied = conditions;
    this.steps = conditions ? Math.round(conditions.latencyMs / 1000 / model.opt.timestep) : 0;
    this.history = [];

    if (conditions) this.scale(conditions);

    mj.mj_setConst(model, data);
    mj.mj_forward(model, data);
  }

  private scale({ friction, mass, strength }: SimConditions) {
    const { model } = this;
    const geoms = this.array('geom_friction');
    const masses = this.array('body_mass');
    const inertias = this.array('body_inertia');
    const ranges = this.array('actuator_forcerange');

    for (let g = 0; g < model.ngeom; g++) geoms[g * 3] *= friction;

    for (let b = 1; b < model.nbody; b++) {
      masses[b] *= mass;

      for (let k = 0; k < 3; k++) inertias[b * 3 + k] *= mass;
    }

    for (let i = 0; i < ranges.length; i++) ranges[i] *= strength;
  }

  delay(ctrl: MjData['ctrl']) {
    if (this.steps <= 0) return;

    this.history.push(Float64Array.from(ctrl));

    const late = this.history.length > this.steps ? this.history.shift()! : this.history[0];

    ctrl.set(late);
  }

  reprime() {
    this.history = [];
  }

  read(): SimConditions | null {
    const { applied, baseline } = this;

    if (!applied || !baseline) return null;

    return {
      friction: ratio(this.array('geom_friction'), baseline.geom_friction, { from: 0, step: 3 }),
      mass: ratio(this.array('body_mass'), baseline.body_mass, { from: 1, step: 1 }),
      strength: ratio(this.array('actuator_forcerange'), baseline.actuator_forcerange, { from: 0, step: 1 }),
      latencyMs: applied.latencyMs,
    };
  }
}
