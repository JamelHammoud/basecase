import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Poser } from './anythingPoser';
import type { IntentKey, IntentPose, PartGoal } from './anythingTypes';

const R2D = 180 / Math.PI;
const RAMP_S = 0.8;
const SETTLE_S = 2;
const ROUNDS = 4;
const AXES = ['right', 'forward', 'up', 'height'] as const;

export type JointValues = Record<string, number>;

interface Measured {
  up: number;
  tilt: number;
  parts: Record<string, Required<PartGoal>>;
  joints: JointValues;
}

export function rampAnimation(from: JointValues, to: JointValues, seconds = RAMP_S): RobotAnimation {
  return {
    id: 'settle',
    name: 'Settle',
    duration: seconds,
    loop: false,
    interpolation: 'linear',
    keyframes: [
      { t: 0, values: from },
      { t: seconds, values: to },
    ],
  };
}

export class Statics {
  private readonly mj: MainModule;
  private readonly engine: SimEngine;
  private readonly poser: Poser;
  readonly restValues: JointValues;

  constructor(options: { mj: MainModule; model: SimModel; poser: Poser }) {
    this.mj = options.mj;
    this.poser = options.poser;
    this.engine = new SimEngine(options.mj, options.model);
    this.restValues = Object.fromEntries(options.poser.facts.joints.map((j) => [j.id, j.restDeg]));
  }

  valuesOf(q: number[]): JointValues {
    return Object.fromEntries(
      this.poser.facts.joints.map((j) => [j.id, Math.round(q[this.poser.jointAdr[j.id]] * R2D * 1000) / 1000]),
    );
  }

  measure(values: JointValues): Measured {
    const { engine, poser } = this;
    const { facts } = poser;

    engine.setController({ kind: 'animation', animation: rampAnimation(this.restValues, values) });
    engine.reset();
    engine.setState(facts.rest);
    engine.step(SETTLE_S);

    const root = this.mj.mj_name2id(engine.model, this.mj.mjtObj.mjOBJ_BODY.value, facts.root);
    const { xpos, xmat } = engine.data;
    const [bx, by, bz] = facts.base;
    const parts = Object.fromEntries(
      facts.parts.map((p) => {
        const b = poser.bodyOf(p.id);
        const [x, y, z] = [xpos[b * 3], xpos[b * 3 + 1], xpos[b * 3 + 2]];

        return [p.id, { right: -(x - bx) * 1000, forward: -(y - by) * 1000, up: (z - bz) * 1000, height: z * 1000 }];
      }),
    );

    return {
      up: xpos[root * 3 + 2] - bz,
      tilt: Math.atan2(-xmat[root * 9 + 5], xmat[root * 9 + 8]),
      parts,
      joints: this.valuesOf(Array.from(engine.data.qpos as ArrayLike<number>)),
    };
  }

  private correction(want: IntentPose, got: Measured): { error: number; bump: IntentPose } {
    const bump: IntentPose = { base: {}, parts: {}, joints: {} };
    let error = 0;

    if (want.base?.up !== undefined || want.base?.tilt !== undefined) {
      const up = (want.base.up ?? 0) - got.up;
      const tilt = (want.base.tilt ?? 0) - got.tilt;

      bump.base = { up, tilt };
      error = Math.max(error, Math.abs(up) / 0.004, Math.abs(tilt) / 0.02);
    }

    for (const [part, goal] of Object.entries(want.parts ?? {})) {
      const delta: PartGoal = {};

      for (const axis of AXES.filter((a) => goal[a] !== undefined)) {
        delta[axis] = goal[axis]! - got.parts[part][axis];
        error = Math.max(error, Math.abs(delta[axis]!) / 3);
      }

      bump.parts![part] = delta;
    }

    for (const [id, deg] of Object.entries(want.joints ?? {})) {
      bump.joints![id] = deg - got.joints[id];
      error = Math.max(error, Math.abs(bump.joints![id]) / 1.5);
    }

    return { error, bump };
  }

  private bumped(aim: IntentPose, bump: IntentPose): IntentPose {
    const base = aim.base || bump.base?.up !== undefined ? { ...aim.base } : undefined;

    if (base && bump.base) {
      base.up = (base.up ?? 0) + (bump.base.up ?? 0);
      base.tilt = (base.tilt ?? 0) + (bump.base.tilt ?? 0);
    }

    const parts = Object.fromEntries(
      Object.entries(aim.parts ?? {}).map(([part, goal]) => [
        part,
        Object.fromEntries(
          Object.entries(goal).map(([a, v]) => [a, v + (bump.parts?.[part]?.[a as keyof PartGoal] ?? 0)]),
        ),
      ]),
    );
    const joints = Object.fromEntries(
      Object.entries(aim.joints ?? {}).map(([id, v]) => [id, v + (bump.joints?.[id] ?? 0)]),
    );

    return { ...aim, ...(base ? { base } : {}), parts, joints };
  }

  solve(want: IntentPose, start: number[]): { values: JointValues; q: number[]; error: number } {
    let aim: IntentPose = { ...want, base: want.base ? { ...want.base } : undefined };
    let best = { values: this.restValues, q: start, error: Infinity };

    for (let round = 0; round < ROUNDS; round++) {
      const { q } = this.poser.keyQpos(aim, start);
      const values = this.valuesOf(q);
      const fit = this.correction(want, this.measure(values));

      if (fit.error < best.error) best = { values, q, error: fit.error };

      if (fit.error < 0.5) break;

      aim = this.bumped(aim, fit.bump);
    }

    return best;
  }

  keyValues(keys: IntentKey[]): Array<{ t: number; values: JointValues; error: number }> {
    let previous = this.poser.facts.rest;

    return keys.map((key) => {
      const still = !key.base && !key.parts && !key.joints;

      if (still) return { t: key.t, values: this.restValues, error: 0 };

      const solved = this.solve(key, previous);

      previous = solved.q;

      return { t: key.t, values: solved.values, error: solved.error };
    });
  }

  dispose() {
    this.engine.dispose();
  }
}
