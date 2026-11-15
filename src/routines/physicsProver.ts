import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { SkillState } from '../skills/environment';
import type { RobotPoseState } from '../types/robotics';
import type { Motion } from './schema';
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
  driftM?: number;
}

export type SwitchAt = (seed: number) => number;

export interface PairRun {
  falls: number;
  sampled: Sampled[];
  starts: SkillState[];
  simulatedS: number;
}

export interface PairMoves {
  fromMove?: Motion;
  toMove?: Motion;
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

export const atHandoffPhase = (from: string): SwitchAt => (from === 'settle' ? atKitPhase : atRandomPhase);

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

  private apply(skills: Skills, previous: BodyControl | null, move?: Motion) {
    const next = controlFor(this.body, skills, move);

    applyControl(this.engine, next, previous);
    this.control = next;
  }

  private start(skills: Skills, seed: number, move?: Motion) {
    const moving = skills.body === 'walk' || skills.body === 'turn-away';

    this.apply(moving ? { body: 'settle', head: null } : skills, null, moving ? undefined : move);
    this.engine.reset(perturbed(this.body.model, seed));

    if (!moving) return;

    this.engine.step(FROM_S);
    this.apply(skills, this.control, move);
  }

  private switchTo(skills: Skills, move?: Motion): Sampled {
    const start = this.probe.pose();

    this.apply(skills, this.control, move);

    const late = this.advance(TO_S - STILL_S, start, start.yaw);
    const end = this.advance(STILL_S, start, late.pose.yaw);

    return { start, late: late.pose, end: end.pose, driftM: Math.max(late.driftM, end.driftM) };
  }

  private advance(seconds: number, start: BodyPose, yaw: number) {
    let pose = this.probe.pose();
    let driftM = 0;

    for (let tick = 0; tick < Math.round(seconds / 0.02); tick++) {
      this.engine.step(0.02);

      const next = this.probe.pose();
      const delta = next.yaw - pose.yaw;

      yaw += Math.atan2(Math.sin(delta), Math.cos(delta));
      driftM = Math.max(driftM, Math.hypot(next.base[0] - start.base[0], next.base[1] - start.base[1]));
      pose = next;
    }

    return { pose: { ...pose, yaw }, driftM };
  }

  run(from: string, to: string, switchAt: SwitchAt, moves: PairMoves = {}): PairRun {
    const run: PairRun = { falls: 0, sampled: [], starts: [], simulatedS: 0 };

    for (let seed = 1; seed <= PROOF_SEEDS; seed++) {
      this.start({ body: from, head: null }, seed, moves.fromMove);
      this.engine.step(switchAt(seed));
      run.starts.push(this.probe.state());
      run.sampled.push(this.switchTo({ body: to, head: null }, moves.toMove));
      run.simulatedS += this.engine.data.time;

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
