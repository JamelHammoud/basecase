import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from './artifacts';
import type { Contract } from './contract';
import type { SignalSource } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { RaceCost } from './raceTypes';
import type { Method } from './router';

export interface Proposal {
  contract: Contract;
  signals: Record<string, SignalSource>;
}

export interface LabelledRollout {
  dt: number;
  qpos: number[][];
}

export type Approval =
  { approved: true } | { approved: false; note: string; rollout?: LabelledRollout; shouldPass?: boolean };

export interface AnythingInput {
  mj: MainModule;
  prompt: string;
  design: string;
  model: SimModel;
  approve: (proposal: Proposal) => Promise<Approval>;
  forge: ForgeRunner;
  save: SkillSave;
  budget: { steps: number; wallS: number };
  signal: AbortSignal;
  method?: Method;
}

export type AnythingOutcome =
  | { kind: 'skill'; skill: Skill; method: Method; cost: RaceCost }
  | { kind: 'not-found'; reason: string; cost: RaceCost }
  | { kind: 'refused'; reason: string }
  | { kind: 'unverifiable'; reason: string };

export type Cmp = '<' | '<=' | '>' | '>=';

export type SpecWindow = 'whole' | { from: number; to: number } | { last: number };

export type SpecState =
  | { atom: { sig: string; cmp: Cmp; value: number; abs?: boolean } }
  | { within: { sig: string; center: number; tol: number } }
  | { near: { part: string; right: number; forward: number; up: number; tol: number } }
  | { all: SpecState[] }
  | { any: SpecState[] }
  | { not: SpecState };

export type SpecFormula =
  | { always: { window: SpecWindow; state: SpecState } }
  | { eventually: { window: SpecWindow; state: SpecState } }
  | { hold_for: { seconds: number; state: SpecState; within: SpecWindow } }
  | { sequence: SpecFormula[] }
  | { all: SpecFormula[] }
  | { any: SpecFormula[] };

export interface PartGoal {
  right?: number;
  forward?: number;
  up?: number;
  height?: number;
}

export interface IntentPose {
  base?: { forward?: number; left?: number; up?: number; tilt?: number };
  joints?: Record<string, number>;
  parts?: Record<string, PartGoal>;
}

export interface IntentKey extends IntentPose {
  t: number;
}

export interface TaskSpec {
  kind: 'task';
  name: string;
  seconds: number;
  startOffsetDeg: number;
  restIsGoal: boolean;
  success: SpecFormula;
  failures: Array<{ label: string; formula: SpecFormula }>;
  intent: IntentKey[];
}

export type IntentVerdict = TaskSpec | { kind: 'deformable' | 'impossible'; reason: string };

export interface Labelled extends LabelledRollout {
  pass: boolean;
  name: string;
}
