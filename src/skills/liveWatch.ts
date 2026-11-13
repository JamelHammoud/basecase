import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from '../sim/engine';
import type { RobotPoseState } from '../types/robotics';
import { signalReaders, type SignalReader } from './arenaSignals';
import { evaluateContract, type Contract } from './contract';
import type { Environment, SignalSource } from './environment';

export const WATCH_PERIOD_S = 8;

const STEP_S = 0.02;

export interface WatchCheck {
  robot: string;
  contract: Contract;
  signals: Record<string, SignalSource>;
  traceDt: number;
  horizonS: number;
}

export interface WatchInput {
  id: number;
  start: RobotPoseState | null;
  check: WatchCheck | null;
}

export type WatchPlan = Omit<WatchInput, 'id'>;

export function watchPlan(environment: Environment | null): WatchPlan {
  if (!environment) return { start: null, check: null };

  const { robot, contract, signals, traceDt, horizonS } = environment;

  return { start: environment.reset.pose ?? null, check: { robot, contract, signals, traceDt, horizonS } };
}

export const watchPeriod = (check: WatchCheck | null) => Math.max(WATCH_PERIOD_S, check?.horizonS ?? 0);

interface Judge {
  check: WatchCheck;
  readers: Record<string, SignalReader>;
  ticks: number;
}

function judgeOf(mj: MainModule, engine: SimEngine, check: WatchCheck | null): Judge | null {
  if (!check) return null;

  try {
    const readers = signalReaders({ mj, engine, robot: check.robot }, check.signals);

    return { check, readers, ticks: Math.floor(check.horizonS / check.traceDt + 1e-9) + 1 };
  } catch {
    return null;
  }
}

export class LiveWatch {
  private readonly engine: SimEngine;
  private readonly input: WatchInput;
  private readonly judge: Judge | null;
  private readonly onMargin: (id: number, margin: number) => void;
  private readonly dt: number;
  private readonly period: number;
  private signals: Record<string, number[]> = {};
  private samples = 0;
  private t = 0;
  private owed = 0;

  constructor(options: {
    mj: MainModule;
    engine: SimEngine;
    input: WatchInput;
    onMargin: (id: number, margin: number) => void;
  }) {
    const { mj, engine, input, onMargin } = options;

    this.engine = engine;
    this.input = input;
    this.onMargin = onMargin;
    this.judge = judgeOf(mj, engine, input.check);
    this.dt = this.judge?.check.traceDt ?? STEP_S;
    this.period = watchPeriod(this.judge?.check ?? null);
    this.restart();
  }

  advance(seconds: number) {
    this.owed += seconds;

    while (this.owed >= this.dt - 1e-9) {
      if (this.t >= this.period - 1e-9) this.restart();

      this.sample();
      this.engine.step(this.dt);
      this.t += this.dt;
      this.owed -= this.dt;
    }
  }

  private restart() {
    this.engine.reset(this.input.start ?? undefined);
    this.t = 0;
    this.samples = 0;
    this.signals = Object.fromEntries(Object.keys(this.judge?.readers ?? {}).map((name) => [name, []]));
  }

  private sample() {
    const judge = this.judge;

    if (!judge || this.samples >= judge.ticks) return;

    for (const [name, read] of Object.entries(judge.readers)) this.signals[name].push(read());

    this.samples += 1;

    if (this.samples === judge.ticks) this.score(judge.check, this.signals);
  }

  private score(check: WatchCheck, signals: Record<string, number[]>) {
    const { id } = this.input;

    void evaluateContract(check.contract, { dt: check.traceDt, signals }).then(
      (result) => Number.isFinite(result.margin) && this.onMargin(id, result.margin),
      () => null,
    );
  }
}
