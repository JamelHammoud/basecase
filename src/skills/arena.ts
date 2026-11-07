import type { MainModule } from '@mujoco/mujoco';
import type { Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { arenaSummary, clopperPearsonLower } from './arenaStats';
import { signalReaders, type SignalReader } from './arenaSignals';
import { ArenaWorld, drawInstance, seededRandom, trialSeed, withTimestep, type ArenaRanges } from './arenaWorld';
import { contractHash, modelHashes, type ArenaEvidence, type ArenaVariant, type ArenaVariantResult } from './artifacts';
import { evaluateContract, type Contract } from './contract';
import { environmentHash, validateEnvironment, type Environment, type Range } from './environment';
import { canonicalJson, sha256Hex } from './hash';

export const ARENA = Object.freeze({
  version: 1,
  trials: 32,
  confidence: 0.95,
  bar: 0.75,
  variants: Object.freeze(['held-out', 'half-timestep', 'latency'] as const),
  floor: Object.freeze({
    friction: Object.freeze([0.8, 1.2] as const),
    mass: Object.freeze([0.9, 1.1] as const),
    strength: Object.freeze([0.9, 1] as const),
    latencyMs: Object.freeze([0, 40] as const),
    jointNoiseDeg: 1,
  }),
});

export interface ArenaInput {
  mj: MainModule;
  model: SimModel;
  contract: Contract;
  controller: Controller;
  environment: Environment;
  salt?: Uint8Array;
}

const widen = (a: Range, b: readonly [number, number]): Range => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];

function rangesFor(env: Environment, variant: ArenaVariant): ArenaRanges {
  const { randomization: r, reset } = env;
  const { floor } = ARENA;

  return {
    friction: widen(r.friction, floor.friction),
    mass: widen(r.mass, floor.mass),
    strength: widen(r.strength, floor.strength),
    latencyMs: variant === 'latency' ? widen(r.latencyMs, floor.latencyMs) : r.latencyMs,
    jointNoiseDeg: Math.max(reset.jointNoiseDeg, floor.jointNoiseDeg),
    baseYawDeg: reset.baseYawDeg,
    baseOffsetMm: reset.baseOffsetMm,
  };
}

const times = (r: Range) => `×${r[0]} to ×${r[1]}`;

function conditionsFor(env: Environment): string[] {
  const held = rangesFor(env, 'held-out');
  const late = rangesFor(env, 'latency');

  return [
    `Friction ${times(held.friction)}`,
    `Link masses ${times(held.mass)}`,
    `Servo strength ${times(held.strength)}`,
    `Start joints within ±${held.jointNoiseDeg}°`,
    `Heading within ±${held.baseYawDeg}°, start position within ±${held.baseOffsetMm} mm`,
    `Servo delay ${held.latencyMs[0]} to ${held.latencyMs[1]} ms, and ${late.latencyMs[0]} to ${late.latencyMs[1]} ms in the delay runs`,
    `${env.horizonS} s per try`,
  ];
}

interface TrialPlan {
  world: ArenaWorld;
  readers: Record<string, SignalReader>;
  input: ArenaInput;
  variant: ArenaVariant;
  salt: Uint8Array;
  envHash: string;
}

function rollout(plan: TrialPlan): Record<string, number[]> {
  const { world, readers, input } = plan;
  const { horizonS, traceDt } = input.environment;
  const ticks = Math.floor(horizonS / traceDt + 1e-9) + 1;
  const names = Object.keys(readers);
  const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));

  for (let tick = 0; tick < ticks; tick++) {
    if (tick > 0) world.engine.step(traceDt);

    for (const name of names) signals[name].push(readers[name]());
  }

  return signals;
}

async function runTrial(plan: TrialPlan, trial: number) {
  const { world, input, variant, salt, envHash } = plan;
  const { environment: env } = input;
  const random = seededRandom(trialSeed({ salt, variant, trial, environment: envHash }));
  const instance = drawInstance(random, {
    ranges: rangesFor(env, variant),
    bodies: world.engine.model.nbody - 1,
    joints: world.engine.sim.joints.length,
  });

  world.prepare({
    instance,
    controller: input.controller,
    start: env.reset.pose ?? input.model.initial,
    robot: env.robot,
  });

  const signals = rollout(plan);
  const result = await evaluateContract(input.contract, { dt: env.traceDt, signals });
  const diverged = world.diverged();

  return { passed: result.passed && !diverged, diverged, failed: result.failed };
}

async function runVariant(input: ArenaInput, variant: ArenaVariant, salt: Uint8Array): Promise<ArenaVariantResult> {
  const model = variant === 'half-timestep' ? withTimestep(input.model, 0.5) : input.model;
  const world = new ArenaWorld(input.mj, model);
  const result: ArenaVariantResult = {
    variant,
    trials: ARENA.trials,
    passes: 0,
    lowerBound: 0,
    diverged: 0,
    failures: {},
  };

  try {
    const readers = signalReaders(
      { mj: input.mj, engine: world.engine, robot: input.environment.robot },
      input.environment.signals,
    );
    const plan: TrialPlan = { world, readers, input, variant, salt, envHash: environmentHash(input.environment) };

    for (let trial = 0; trial < ARENA.trials; trial++) {
      const outcome = await runTrial(plan, trial);

      result.passes += outcome.passed ? 1 : 0;
      result.diverged += outcome.diverged ? 1 : 0;

      for (const label of outcome.failed) result.failures[label] = (result.failures[label] ?? 0) + 1;
    }
  } finally {
    world.dispose();
  }

  result.lowerBound = clopperPearsonLower(result.passes, result.trials, ARENA.confidence);

  return result;
}

async function checkedInput(input: ArenaInput) {
  if (canonicalJson(input.contract) !== canonicalJson(input.environment.contract)) {
    throw new Error('Arena judges the contract the environment carries. These two differ.');
  }

  const problems = await validateEnvironment(input.environment, input.model);

  if (problems.length) throw new Error(problems.join(' '));
}

export async function runArena(input: ArenaInput): Promise<ArenaEvidence> {
  await checkedInput(input);

  const salt = input.salt ?? crypto.getRandomValues(new Uint8Array(32));
  const variants: ArenaVariantResult[] = [];

  for (const variant of ARENA.variants) variants.push(await runVariant(input, variant, salt));

  const lowerBound = Math.min(...variants.map((v) => v.lowerBound));
  const hashes = modelHashes(input.model);

  return {
    arenaVersion: ARENA.version,
    binding: {
      contract: contractHash(input.contract),
      physics: hashes.physics,
      actuators: hashes.actuators,
      environment: environmentHash(input.environment),
    },
    confidence: ARENA.confidence,
    bar: ARENA.bar,
    variants,
    lowerBound,
    passed: variants.every((v) => v.lowerBound >= ARENA.bar),
    conditions: conditionsFor(input.environment),
    summary: arenaSummary({ variants, lowerBound, confidence: ARENA.confidence }),
    saltCommitment: sha256Hex(salt),
  };
}
