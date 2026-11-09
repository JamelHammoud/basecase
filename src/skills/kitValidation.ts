import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { ARENA } from './arena';
import { signalReaders } from './arenaSignals';
import { ArenaWorld, drawInstance, seededRandom, withTimestep, type ArenaRanges } from './arenaWorld';
import { evaluateContract, type Contract } from './contract';
import type { Environment, Range } from './environment';
import { sha256Hex } from './hash';
import { KIT_BARS, kitSpeedContract } from './kitEnvironment';
import { kitRobot, kitTopSpeed, type V3 } from './kitModel';

const DRAWS = 12;
const TURN_RATE = 0.5;
const TURN_SHARE = 0.175;
const TURN_WEIGHT = 0.1;
const MARGIN_WEIGHT = 0.01;

export interface ValidationInput {
  mj: MainModule;
  model: SimModel;
  environment: Environment;
  policy: PolicySpec;
  salt?: string;
  draws?: number;
}

interface Check {
  command: V3;
  contract: Contract | null;
}

interface Trial {
  passed: boolean;
  margin: number;
}

interface Bench {
  input: ValidationInput;
  worlds: [ArenaWorld, ArenaWorld];
  salt: string;
}

const widen = (a: Range, b: readonly [number, number]): Range => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];

function rangesFor(env: Environment): ArenaRanges {
  const { randomization: r, reset } = env;
  const { floor } = ARENA;

  return {
    friction: widen(r.friction, floor.friction),
    mass: widen(r.mass, floor.mass),
    strength: widen(r.strength, floor.strength),
    latencyMs: widen(r.latencyMs, floor.latencyMs),
    jointNoiseDeg: Math.max(reset.jointNoiseDeg, floor.jointNoiseDeg),
    baseYawDeg: reset.baseYawDeg,
    baseOffsetMm: reset.baseOffsetMm,
  };
}

export function validationChecks(model: SimModel): Check[] {
  const top = kitTopSpeed(model);
  const speeds = [top, top / 2, 0].map((s): Check => ({ command: [s, 0, 0], contract: kitSpeedContract(model, s) }));
  const turns = [TURN_RATE, -TURN_RATE].map((w): Check => ({ command: [top / 2, 0, w], contract: null }));

  return [...speeds, ...turns];
}

function rootYaw(mj: MainModule, world: ArenaWorld, robot: string): () => number {
  const { model, data } = world.engine;
  const root = world.engine.sim.robots.find((r) => r.key === robot)?.root ?? '';
  const at = model.jnt_qposadr[mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value, root)] + 3;

  return () => {
    const [w, x, y, z] = [data.qpos[at], data.qpos[at + 1], data.qpos[at + 2], data.qpos[at + 3]];

    return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  };
}

function rollout(world: ArenaWorld, input: ValidationInput) {
  const { horizonS, traceDt, signals: sources, robot } = input.environment;
  const readers = signalReaders({ mj: input.mj, engine: world.engine, robot }, sources);
  const names = Object.keys(readers);
  const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const yawOf = rootYaw(input.mj, world, robot);
  const ticks = Math.floor(horizonS / traceDt + 1e-9) + 1;
  let [yaw, previous] = [0, yawOf()];

  for (let tick = 0; tick < ticks; tick++) {
    if (tick > 0) world.engine.step(traceDt);

    for (const name of names) signals[name].push(readers[name]());

    const now = yawOf();

    yaw += Math.atan2(Math.sin(now - previous), Math.cos(now - previous));
    previous = now;
  }

  return { signals, yaw };
}

function turnTrial(signals: Record<string, number[]>, turned: number, rate: number, seconds: number): Trial {
  const start = signals.height[0];
  const upright =
    signals.height.every((h) => h >= KIT_BARS.walkHeightShare * start) &&
    signals.tilt.every((t) => t < KIT_BARS.walkTiltRad);
  const bar = TURN_SHARE * Math.abs(rate) * seconds;
  const margin = (Math.sign(rate) * turned - bar) / bar;

  return { passed: upright && margin > 0, margin };
}

async function trial(bench: Bench, check: Check, draw: number): Promise<Trial> {
  const { input, worlds, salt } = bench;
  const world = worlds[draw % 2];
  const random = seededRandom(sha256Hex(`kit-validation|${salt}|${check.command.join(',')}|${draw}`));
  const instance = drawInstance(random, {
    ranges: rangesFor(input.environment),
    bodies: world.engine.model.nbody - 1,
    joints: world.engine.sim.joints.length,
  });
  const policy = { ...input.policy, command: check.command };

  world.prepare({
    instance,
    controller: { kind: 'policy', policy, robot: kitRobot(input.model).key },
    start: input.environment.reset.pose ?? input.model.initial,
    robot: input.environment.robot,
  });

  const { signals, yaw } = rollout(world, input);

  if (world.diverged()) return { passed: false, margin: -1 };

  if (!check.contract) return turnTrial(signals, yaw, check.command[2], input.environment.horizonS);

  const result = await evaluateContract(check.contract, { dt: input.environment.traceDt, signals });

  return { passed: result.passed, margin: result.margin };
}

const clipped = (m: number) => (Number.isFinite(m) ? Math.max(-1, Math.min(1, m)) : -1);

export interface CheckResult {
  command: V3;
  passed: number;
  margin: number;
}

export interface ValidationReport {
  checks: CheckResult[];
  score: number;
}

function summary(command: V3, trials: Trial[]): CheckResult {
  const passed = trials.filter((t) => t.passed).length / trials.length;
  const margin = trials.reduce((sum, t) => sum + clipped(t.margin), 0) / trials.length;

  return { command, passed, margin };
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);

function scored(checks: CheckResult[]): number {
  const speeds = checks.filter((c) => c.command[2] === 0);
  const turns = checks.filter((c) => c.command[2] !== 0);
  const weakest = Math.min(...speeds.map((c) => c.passed));

  return weakest + TURN_WEIGHT * mean(turns.map((c) => c.passed)) + MARGIN_WEIGHT * mean(checks.map((c) => c.margin));
}

export async function validationReport(input: ValidationInput): Promise<ValidationReport> {
  const salt = input.salt ?? sha256Hex(String(crypto.getRandomValues(new Uint32Array(4)).join('-')));
  const worlds: [ArenaWorld, ArenaWorld] = [
    new ArenaWorld(input.mj, input.model),
    new ArenaWorld(input.mj, withTimestep(input.model, 0.5)),
  ];
  const bench: Bench = { input, worlds, salt };
  const checks: CheckResult[] = [];

  try {
    for (const check of validationChecks(input.model)) {
      const trials: Trial[] = [];

      for (let draw = 0; draw < (input.draws ?? DRAWS); draw++) trials.push(await trial(bench, check, draw));

      checks.push(summary(check.command, trials));
    }
  } finally {
    worlds.forEach((w) => w.dispose());
  }

  return { checks, score: scored(checks) };
}

export const validationScore = async (input: ValidationInput) => (await validationReport(input)).score;
