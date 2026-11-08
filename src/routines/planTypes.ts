import type { Capability, Condition, DataType, Motion, Resource, Step } from './schema';
import type { NodeInput } from './nodes';

export const PLAN_SCHEMA = 1;
export const END = -1;
export const ABANDON = -2;
export const NO_SKILL = 0xffff;
export const MASK: Record<Resource, number> = { body: 1, head: 2, voice: 4 };
export const STOP_TIMEOUT_MS = 5000;
export const CONTROL_DEADLINE_MS = 500;
export const OP_CODES = { eqNum: 0, eqSym: 1, atLeast: 2, atMost: 3, all: 4, any: 5, not: 6 } as const;

export type FactSource = 'watcher' | 'infer' | 'ask';
export type Instr = [code: number, a: number, b: number];

export interface PlanFact {
  id: string;
  type: DataType | NodeInput;
  maxAgeMs: number;
  source: FactSource;
}

export interface PlanSkill {
  id: string;
  holds: number;
  interrupt: 0 | 1 | 2;
  stopVia: number;
}

export interface TextSlot {
  slot: string;
  fact: number;
  field: 'name' | 'score' | 'value';
}

export interface PlanText {
  template: string;
  slots: TextSlot[];
}

export interface PlanOp {
  kind: Step['kind'];
  node: string;
  owner: number;
  next: number;
  onTimeout: number;
  onFail: number;
  timeoutMs: number;
  skill?: number;
  holds?: number;
  move?: Motion;
  text?: number;
  needs?: number[];
  fact?: number;
  model?: string;
  input?: string;
  prompt?: string;
  answers?: number[];
  test?: number;
  then?: number;
  else?: number;
  until?: number;
  ms?: number;
  branches?: number[];
  joinAny?: boolean;
}

export interface PlanReaction {
  id: string;
  when: number;
  cooldownMs: number;
  retrigger: 0 | 1 | 2;
  stopFirst: boolean;
  entry: number;
}

export interface PlanWatcher {
  id: string;
  model: string;
  rateHz: number;
  maxAgeMs: number;
  fact: number;
  when: number;
}

export interface PlanBase {
  node: string;
  skill: number;
  timeoutMs: number;
  onTimeout: number;
  onFail: number;
}

export interface Plan {
  schema: 1;
  routine: { id: string; name: string; sentence?: string };
  requires: Capability[];
  facts: PlanFact[];
  skills: PlanSkill[];
  symbols: string[];
  texts: PlanText[];
  conds: Instr[][];
  condSources: Condition[];
  ops: PlanOp[];
  reactions: PlanReaction[];
  watchers: PlanWatcher[];
  base: PlanBase;
  safeStop: number;
  stopTimeoutMs: number;
  controlDeadlineMs: number;
  transitions: string[];
  hash: string;
}

export const maskOf = (resources: readonly Resource[]) => resources.reduce((m, r) => m | MASK[r], 0);
