import type { MainModule } from '@mujoco/mujoco';
import { ControlDelay } from './controlDelay';
import type { SimEngine } from './engine';

export interface SimPhysics {
  friction: number;
  mass: number;
  strength: number;
  latencyMs: number;
}

const FIELDS = ['geom_friction', 'body_mass', 'body_inertia', 'actuator_forcerange'] as const;

type Field = (typeof FIELDS)[number];

const sum = (values: ArrayLike<number>, from = 0) => {
  let total = 0;

  for (let i = from; i < values.length; i++) total += values[i];

  return total;
};

const ratio = (now: ArrayLike<number>, base: ArrayLike<number>, from = 0) => {
  const whole = sum(base, from);

  return whole ? sum(now, from) / whole : 1;
};

export class LivePhysics {
  private delay = new ControlDelay();
  private engine: SimEngine | null = null;
  private baseline: Record<Field, Float64Array> | null = null;
  private active = false;

  module(mj: MainModule): MainModule {
    return this.delay.module(mj);
  }

  attach(engine: SimEngine) {
    this.engine = engine;
    this.delay.reset();
    this.active = false;
    this.baseline = Object.fromEntries(
      FIELDS.map((field) => [field, Float64Array.from(engine.model[field] as ArrayLike<number>)]),
    ) as Record<Field, Float64Array>;
  }

  apply(mj: MainModule, physics: SimPhysics | null) {
    const { engine, baseline } = this;

    if (!engine || !baseline) return;

    for (const field of FIELDS) (engine.model[field] as Float64Array).set(baseline[field]);

    this.delay.reset(physics ? Math.round(physics.latencyMs / 1000 / engine.dt) : 0);
    this.active = !!physics;

    if (physics) this.scale(physics);

    mj.mj_setConst(engine.model, engine.data);
  }

  applied(): SimPhysics | null {
    const { engine, baseline } = this;

    if (!engine || !baseline || !this.active) return null;

    const { model } = engine;

    return {
      friction: baseline.geom_friction[0]
        ? (model.geom_friction as ArrayLike<number>)[0] / baseline.geom_friction[0]
        : 1,
      mass: ratio(model.body_mass as ArrayLike<number>, baseline.body_mass, 1),
      strength: ratio(model.actuator_forcerange as ArrayLike<number>, baseline.actuator_forcerange),
      latencyMs: this.delay.steps * engine.dt * 1000,
    };
  }

  private scale(physics: SimPhysics) {
    const { model } = this.engine!;
    const friction = model.geom_friction as Float64Array;
    const forcerange = model.actuator_forcerange as Float64Array;

    for (let g = 0; g < model.ngeom; g++) friction[g * 3] *= physics.friction;

    for (let b = 1; b < model.nbody; b++) {
      model.body_mass[b] *= physics.mass;

      for (let k = 0; k < 3; k++) model.body_inertia[b * 3 + k] *= physics.mass;
    }

    for (let i = 0; i < forcerange.length; i++) forcerange[i] *= physics.strength;
  }
}
