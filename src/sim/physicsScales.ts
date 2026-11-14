import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';

export interface PhysicsScales {
  friction: number;
  mass: number;
  strength: number;
  latencyMs: number;
}

export const NOMINAL_PHYSICS: Readonly<PhysicsScales> = Object.freeze({
  friction: 1,
  mass: 1,
  strength: 1,
  latencyMs: 0,
});

export const latencySteps = (latencyMs: number, dt: number) => Math.round(latencyMs / 1000 / dt);

const SCALED = ['geom_friction', 'body_mass', 'body_inertia'] as const;

type Baseline = Record<(typeof SCALED)[number], Float64Array>;

interface Physics {
  mj: MainModule;
  model: MjModel;
  data: MjData;
}

function keepingState({ mj, model, data }: Physics, change: () => void) {
  const signature = mj.mjtState.mjSTATE_INTEGRATION.value;
  const buffer = new mj.DoubleBuffer(mj.mj_stateSize(model, signature));

  try {
    mj.mj_getState(model, data, buffer, signature);

    const state = Array.from(buffer.GetView() as Float64Array);

    change();
    mj.mj_setState(model, data, state, signature);
    mj.mj_forward(model, data);
  } finally {
    buffer.delete();
  }
}

export class ScaledPhysics {
  private readonly physics: Physics;
  private readonly baseline: Baseline;
  private scales: PhysicsScales | null = null;
  private line: Float64Array[] = [];
  private stepped = 0;

  constructor(physics: Physics) {
    this.physics = physics;
    this.baseline = Object.fromEntries(
      SCALED.map((field) => [field, Float64Array.from(physics.model[field] as ArrayLike<number>)]),
    ) as Baseline;
  }

  set(scales: PhysicsScales | null) {
    if (!scales && !this.scales) return;

    const { mj, model, data } = this.physics;
    const steps = scales ? latencySteps(scales.latencyMs, model.opt.timestep) : 0;

    this.scales = scales;
    this.restore();

    if (scales) this.scale(scales);

    keepingState(this.physics, () => mj.mj_setConst(model, data));
    this.line = Array.from({ length: steps > 0 ? steps + 1 : 0 }, () => new Float64Array(model.nu));
    this.stepped = 0;
  }

  forget() {
    this.stepped = 0;
  }

  delay(ctrl: MjData['ctrl']) {
    const size = this.line.length;

    if (!size) return;

    this.line[this.stepped % size].set(ctrl);
    ctrl.set(this.line[this.stepped < size - 1 ? 0 : (this.stepped + 1) % size]);
    this.stepped++;
  }

  private restore() {
    const { model } = this.physics;

    for (const field of SCALED) (model[field] as Float64Array).set(this.baseline[field]);
  }

  private scale({ friction, mass }: PhysicsScales) {
    const { model } = this.physics;
    const sliding = model.geom_friction as Float64Array;
    const masses = model.body_mass as Float64Array;
    const inertia = model.body_inertia as Float64Array;

    for (let g = 0; g < model.ngeom; g++) sliding[g * 3] *= friction;

    for (let b = 1; b < model.nbody; b++) {
      masses[b] *= mass;

      for (let k = 0; k < 3; k++) inertia[b * 3 + k] *= mass;
    }
  }
}
