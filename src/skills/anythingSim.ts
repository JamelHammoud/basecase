import type { MainModule } from '@mujoco/mujoco';
import type { Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { ARENA } from './arena';
import { signalReaders, type SignalReader } from './arenaSignals';
import { ArenaWorld, drawInstance, seededRandom, withTimestep, type Instance } from './arenaWorld';
import { evaluateContract, type Contract, type ContractResult, type Trace } from './contract';
import type { Environment } from './environment';
import { sha256Hex } from './hash';

export interface TrialResult {
  result: ContractResult | null;
  trace: Trace;
  diverged: boolean;
}

export interface TrialCase {
  instance: Instance;
  halfStep: boolean;
}

export function nominalInstance(world: ArenaWorld): Instance {
  return {
    friction: 1,
    masses: Array.from({ length: world.engine.model.nbody - 1 }, () => 1),
    strength: 1,
    latencyMs: 0,
    jointNoise: world.engine.sim.joints.map(() => 0),
    yawDeg: 0,
    offsetMm: [0, 0],
  };
}

class Bench {
  readonly world: ArenaWorld;
  readonly readers: Record<string, SignalReader>;

  constructor(mj: MainModule, model: SimModel, env: Environment) {
    this.world = new ArenaWorld(mj, model);
    this.readers = signalReaders({ mj, engine: this.world.engine, robot: env.robot }, env.signals);
  }
}

export class Trials {
  private readonly env: Environment;
  private readonly model: SimModel;
  private readonly full: Bench;
  private readonly half: Bench;

  constructor(options: { mj: MainModule; model: SimModel; environment: Environment }) {
    const { mj, model, environment } = options;

    this.env = environment;
    this.model = model;
    this.full = new Bench(mj, model, environment);
    this.half = new Bench(mj, withTimestep(model, 0.5), environment);
  }

  cases(count: number, seed: string): TrialCase[] {
    const random = seededRandom(sha256Hex(`anything|${seed}`));
    const { world } = this.full;
    const { floor } = ARENA;
    const ranges = {
      friction: [floor.friction[0], floor.friction[1]] as [number, number],
      mass: [floor.mass[0], floor.mass[1]] as [number, number],
      strength: [floor.strength[0], floor.strength[1]] as [number, number],
      latencyMs: [floor.latencyMs[0], floor.latencyMs[1]] as [number, number],
      jointNoiseDeg: floor.jointNoiseDeg,
      baseYawDeg: this.env.reset.baseYawDeg,
      baseOffsetMm: this.env.reset.baseOffsetMm,
    };
    const drawn = Array.from({ length: count }, (_, i) => ({
      instance: drawInstance(random, {
        ranges,
        bodies: world.engine.model.nbody - 1,
        joints: world.engine.sim.joints.length,
      }),
      halfStep: i % 3 === 2,
    }));

    return [{ instance: nominalInstance(world), halfStep: false }, ...drawn];
  }

  async run(controller: Controller, trial: TrialCase, contract: Contract = this.env.contract): Promise<TrialResult> {
    const bench = trial.halfStep ? this.half : this.full;
    const { world, readers } = bench;
    const { horizonS, traceDt } = this.env;
    const ticks = Math.floor(horizonS / traceDt + 1e-9) + 1;
    const names = Object.keys(readers);
    const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));

    world.prepare({
      instance: trial.instance,
      controller,
      start: this.env.reset.pose ?? this.model.initial,
      robot: this.env.robot,
    });

    for (let tick = 0; tick < ticks; tick++) {
      if (tick > 0) world.engine.step(traceDt);

      for (const name of names) signals[name].push(readers[name]());
    }

    const trace = { dt: traceDt, signals };
    const result = await evaluateContract(contract, trace).catch(() => null);

    return { result, trace, diverged: world.diverged() };
  }

  dispose() {
    this.full.world.dispose();
    this.half.world.dispose();
  }
}

const MARGIN_CAP = 5;

export function scoreOf(trial: TrialResult): number {
  const { result, diverged } = trial;

  if (!result || diverged) return -2 * MARGIN_CAP;

  const margin = Math.max(
    -MARGIN_CAP,
    Math.min(MARGIN_CAP, Number.isFinite(result.margin) ? result.margin : -MARGIN_CAP),
  );

  return result.failed.length ? margin - MARGIN_CAP : margin;
}

export const passes = (trial: TrialResult) => !!trial.result?.passed && !trial.diverged;

export interface Judged {
  passed: number;
  worst: number;
}

export async function judgeOn(trials: Trials, controller: Controller, cases: TrialCase[]): Promise<Judged> {
  let passed = 0;
  let worst = Infinity;

  for (const c of cases) {
    const trial = await trials.run(controller, c);

    passed += passes(trial) ? 1 : 0;
    worst = Math.min(worst, scoreOf(trial));
  }

  return { passed, worst };
}

export const betterJudged = (a: Judged, b: Judged) =>
  a.passed > b.passed || (a.passed === b.passed && a.worst > b.worst);
