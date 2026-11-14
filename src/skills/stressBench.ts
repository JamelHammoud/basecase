import type { MainModule } from '@mujoco/mujoco';
import type { Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { PhysicsScales } from '../sim/physicsScales';
import type { RobotPoseState } from '../types/robotics';
import { signalReaders, type SignalReader } from './arenaSignals';
import { ArenaWorld, seededRandom, type Instance } from './arenaWorld';
import { evaluateContract } from './contract';
import type { Environment, Range } from './environment';
import { sha256Hex } from './hash';

export type StressAxis = keyof PhysicsScales;

export const STRESS_AXES: readonly StressAxis[] = Object.freeze(['friction', 'mass', 'strength', 'latencyMs'] as const);

export const STRESS_LIMITS: Readonly<Record<StressAxis, Readonly<Range>>> = Object.freeze({
  friction: Object.freeze([0.2, 1.5] as Range),
  mass: Object.freeze([0.5, 2] as Range),
  strength: Object.freeze([0.4, 1.2] as Range),
  latencyMs: Object.freeze([0, 150] as Range),
});

export const STRESS_STARTS = 2;

export interface StressSample {
  point: PhysicsScales;
  margin: number;
  start: number;
}

export interface BenchInput {
  mj: MainModule;
  model: SimModel;
  controller: Controller;
  environment: Environment;
  budget: number;
  seed: string;
  stop?: () => boolean;
}

const MARGIN_FLOOR = -10;

const clampTo = ([lo, hi]: Readonly<Range>, v: number) => Math.min(hi, Math.max(lo, v));

export const clampPoint = (point: PhysicsScales): PhysicsScales => ({
  friction: clampTo(STRESS_LIMITS.friction, point.friction),
  mass: clampTo(STRESS_LIMITS.mass, point.mass),
  strength: clampTo(STRESS_LIMITS.strength, point.strength),
  latencyMs: clampTo(STRESS_LIMITS.latencyMs, point.latencyMs),
});

const round = (v: number) => Math.round(v * 1e6) / 1e6;

const keyOf = (p: PhysicsScales) => STRESS_AXES.map((a) => round(p[a])).join('|');

export const fails = (sample: StressSample) => sample.margin <= 0;

function runMargin(result: { passed: boolean; margin: number }, diverged: boolean): number {
  if (diverged || !Number.isFinite(result.margin)) return MARGIN_FLOOR;

  const margin = Math.max(MARGIN_FLOOR, result.margin);

  return result.passed ? margin : Math.min(margin, 0);
}

function startPoses(world: ArenaWorld, input: BenchInput): RobotPoseState[] {
  const { environment: env, model, seed } = input;
  const base = env.reset.pose ?? model.initial;
  const size = env.reset.jointNoiseDeg;

  return Array.from({ length: STRESS_STARTS }, (_, d) => {
    const random = seededRandom(sha256Hex(`stress|${seed}|start|${d}`));
    const values = { ...base.values };

    for (const j of world.engine.sim.joints) {
      const [lo, hi] = j.range ?? [-Infinity, Infinity];
      const noise = (2 * random() - 1) * size;

      if (j.robot === env.robot) values[j.id] = Math.max(lo, Math.min(hi, (values[j.id] ?? 0) + noise));
    }

    return { ...base, values };
  });
}

export class StressBench {
  readonly trace: StressSample[] = [];
  readonly starts: RobotPoseState[];
  private input: BenchInput;
  private world: ArenaWorld;
  private readers: Record<string, SignalReader>;
  private seen = new Map<string, StressSample>();
  private cap = Infinity;
  private runs = 0;

  constructor(input: BenchInput) {
    this.input = input;
    this.world = new ArenaWorld(input.mj, input.model);
    this.readers = signalReaders(
      { mj: input.mj, engine: this.world.engine, robot: input.environment.robot },
      input.environment.signals,
    );
    this.starts = startPoses(this.world, input);
  }

  get rollouts() {
    return this.runs;
  }

  left() {
    return this.input.stop?.() ? 0 : Math.min(this.input.budget, this.cap) - this.runs;
  }

  limit(points: number) {
    this.cap = this.runs + Math.max(0, points) * STRESS_STARTS;
  }

  unlimit() {
    this.cap = Infinity;
  }

  async sample(raw: PhysicsScales): Promise<StressSample | null> {
    const point = clampPoint(raw);
    const key = keyOf(point);
    const known = this.seen.get(key);

    if (known) return known;

    if (this.left() < STRESS_STARTS) return null;

    const sample = await this.judge(point);

    this.seen.set(key, sample);
    this.trace.push(sample);

    return sample;
  }

  private instance(point: PhysicsScales): Instance {
    const { engine } = this.world;

    return {
      friction: point.friction,
      masses: new Array<number>(engine.model.nbody - 1).fill(point.mass),
      strength: point.strength,
      latencyMs: point.latencyMs,
      jointNoise: new Array<number>(engine.sim.joints.length).fill(0),
      yawDeg: 0,
      offsetMm: [0, 0],
    };
  }

  private async judge(point: PhysicsScales): Promise<StressSample> {
    let sample: StressSample = { point, margin: Infinity, start: 0 };

    for (let start = 0; start < this.starts.length; start++) {
      const margin = await this.run(point, start);

      if (margin < sample.margin) sample = { point, margin, start };
    }

    return sample;
  }

  private async run(point: PhysicsScales, start: number): Promise<number> {
    const { environment: env, controller } = this.input;

    this.runs += 1;
    this.world.prepare({ instance: this.instance(point), controller, start: this.starts[start], robot: env.robot });

    const signals = this.rollout();
    const result = await evaluateContract(env.contract, { dt: env.traceDt, signals });

    return runMargin(result, this.world.diverged());
  }

  private rollout(): Record<string, number[]> {
    const { horizonS, traceDt } = this.input.environment;
    const ticks = Math.floor(horizonS / traceDt + 1e-9) + 1;
    const names = Object.keys(this.readers);
    const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));

    for (let tick = 0; tick < ticks; tick++) {
      if (tick > 0) this.world.engine.step(traceDt);

      for (const name of names) signals[name].push(this.readers[name]());
    }

    return signals;
  }

  dispose() {
    this.world.dispose();
  }
}
