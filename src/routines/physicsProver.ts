import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { SkillState } from '../skills/environment';
import type { RobotPoseState } from '../types/robotics';
import { applyControl, type BodyControl, BodyProbe, type BodyPose, controlFor, type RoutineBody } from './physicsBody';

export const PROOF_SEEDS = 8;
export const FROM_S = 1.5;
export const PHASE_SPAN_S = 1;

const TO_S = 2;
const STILL_S = 0.5;
const START_NOISE_DEG = 2;
const PHASE_SALT = 0x9e3779b9;

export interface Sampled {
  start: BodyPose;
  late: BodyPose;
  end: BodyPose;
}

export type SwitchAt = (seed: number) => number;

export interface PairRun {
  falls: number;
  sampled: Sampled[];
}

type Skills = { body: string | null; head: string | null };

export function seeded(seed: number) {
  let state = (seed * 2654435761 + 1013904223) >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 2 ** 32;
  };
}

export const atKitPhase: SwitchAt = () => FROM_S;

export const atRandomPhase: SwitchAt = (seed) => FROM_S + seeded((seed ^ PHASE_SALT) >>> 0)() * PHASE_SPAN_S;

function perturbed(model: SimModel, seed: number): RobotPoseState {
  const random = seeded(seed);
  const values = Object.fromEntries(
    Object.entries(model.initial.values).map(([id, v]) => [id, v + (random() * 2 - 1) * START_NOISE_DEG]),
  );

  return { ...model.initial, values };
}

export class Prover {
  private readonly engine: SimEngine;
  private readonly probe: BodyProbe;
  private readonly body: RoutineBody;
  private control: BodyControl | null = null;

  constructor(mj: MainModule, body: RoutineBody) {
    this.body = body;
    this.engine = new SimEngine(mj, body.model);
    this.probe = new BodyProbe(mj, this.engine, body);
  }

  get neck() {
    return this.body.neck;
  }

  private apply(skills: Skills, previous: BodyControl | null) {
    const next = controlFor(this.body, skills);

    applyControl(this.engine, next, previous);
    this.control = next;
  }

  private start(skills: Skills, seed: number) {
    this.apply(skills, null);
    this.engine.reset(perturbed(this.body.model, seed));
  }

  private switchTo(skills: Skills): Sampled {
    const start = this.probe.pose();

    this.apply(skills, this.control);
    this.engine.step(TO_S - STILL_S);

    const late = this.probe.pose();

    this.engine.step(STILL_S);

    return { start, late, end: this.probe.pose() };
  }

  run(from: string, to: string, switchAt: SwitchAt): PairRun {
    const run: PairRun = { falls: 0, sampled: [] };

    for (let seed = 1; seed <= PROOF_SEEDS; seed++) {
      this.start({ body: from, head: null }, seed);
      this.engine.step(switchAt(seed));
      run.sampled.push(this.switchTo({ body: to, head: null }));

      if (this.probe.fellAt() !== null) run.falls += 1;
    }

    return run;
  }

  looked(seed: number): { fell: boolean; neckRad: number } {
    this.start({ body: 'walk', head: null }, seed);
    this.engine.step(FROM_S);
    this.switchTo({ body: 'walk', head: 'look-at' });

    return { fell: this.probe.fellAt() !== null, neckRad: this.neck ? this.probe.joint(this.neck) : Number.NaN };
  }

  states(from: string, count: number): SkillState[] {
    const states: SkillState[] = [];

    for (let seed = 1; seed <= count; seed++) {
      this.start({ body: from, head: null }, seed);
      this.engine.step(atRandomPhase(seed));

      if (this.probe.fellAt() === null) states.push(this.probe.state());
    }

    return states;
  }

  dispose() {
    this.engine.dispose();
  }
}
