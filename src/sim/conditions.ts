import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { ActuatorFaults } from './faults';

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

interface Scan {
  from: number;
  step: number;
  skip?: (i: number) => boolean;
}

function ratio(now: ArrayLike<number>, base: Float64Array, { from, step, skip }: Scan) {
  for (let i = from; i < base.length; i += step) if (base[i] !== 0 && !skip?.(i)) return rounded(now[i] / base[i]);

  return null;
}

export class LiveConditions {
  private mj: MainModule;
  private model: MjModel;
  private data: MjData;
  private faults: ActuatorFaults;
  private baseline: Baseline;
  private applied: SimConditions | null = null;
  private steps = 0;
  private history: Float64Array[] = [];

  constructor(mj: MainModule, model: MjModel, data: MjData, faults: ActuatorFaults) {
    this.mj = mj;
    this.model = model;
    this.data = data;
    this.faults = faults;
    this.baseline = Object.fromEntries(FIELDS.map((f) => [f, Float64Array.from(this.array(f))])) as Baseline;
  }

  private array(field: Field) {
    return this.model[field] as Float64Array;
  }

  apply(conditions: SimConditions | null) {
    const { mj, model, data } = this;

    for (const field of FIELDS) this.array(field).set(this.baseline[field]);

    this.applied = conditions;
    this.steps = conditions ? Math.round(conditions.latencyMs / 1000 / model.opt.timestep) : 0;
    this.history = [];

    if (conditions) this.scale(conditions);

    this.faults.rebase();
    mj.mj_setConst(model, data);
    mj.mj_forward(model, data);
  }

  clear() {
    if (this.applied) this.apply(null);
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
    const { applied, baseline, faults } = this;

    if (!applied) return null;

    const faulted = (i: number) => faults.scales(Math.floor(i / 2));

    return {
      friction: ratio(this.array('geom_friction'), baseline.geom_friction, { from: 0, step: 3 }) ?? applied.friction,
      mass: ratio(this.array('body_mass'), baseline.body_mass, { from: 1, step: 1 }) ?? applied.mass,
      strength:
        ratio(this.array('actuator_forcerange'), baseline.actuator_forcerange, { from: 0, step: 1, skip: faulted }) ??
        applied.strength,
      latencyMs: applied.latencyMs,
    };
  }
}
