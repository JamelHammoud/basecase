export const ROUTINE_SCHEMA = 1;

export type DataType = 'image' | 'detections' | 'pose' | 'text' | 'boolean' | 'number' | 'identity' | 'faceEmbedding';
export type Resource = 'body' | 'head' | 'voice';
export type Capability = 'camera' | 'microphone' | 'speaker' | 'legs' | 'wheels' | 'arms' | 'head' | 'depth';

export type Condition =
  | { fact: string; is: boolean | number | string }
  | { fact: string; atLeast: number }
  | { fact: string; atMost: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface Guarded {
  timeoutMs: number;
  onTimeout: Step[];
  onFail: Step[];
}

interface Named {
  id?: string;
}

export type DoStep = { kind: 'do'; skill: string; holds: Resource[] } & Guarded & Named;
export type SayStep = { kind: 'say'; text: string } & Guarded & Named;
export type InferStep = { kind: 'infer'; model: string; input: string; output: { type: DataType } } & Guarded & Named;
export type AskStep = { kind: 'ask'; prompt: string; input?: string; answers: string[] } & Guarded & Named;
export type IfStep = { kind: 'if'; test: Condition; then: Step[]; else: Step[] } & Named;
export type WaitStep = { kind: 'wait'; until?: Condition; ms?: number } & Guarded & Named;
export type TogetherStep = { kind: 'together'; branches: Step[][]; join: 'all' | 'any' } & Named;

export type Step = DoStep | SayStep | InferStep | AskStep | IfStep | WaitStep | TogetherStep;
export type GuardedStep = DoStep | SayStep | InferStep | AskStep | WaitStep;

export interface Watcher {
  id: string;
  model: string;
  rateHz: number;
  maxAgeMs: number;
  publishes: { type: DataType };
  when?: Condition;
}

export interface Reaction {
  id: string;
  when: Condition;
  cooldownMs: number;
  onRetrigger: 'ignore' | 'restart' | 'queue';
  body: 'keepGoing' | 'stopFirst';
  steps: Step[];
}

export interface Routine {
  schema: 1;
  id: string;
  name: string;
  sentence?: string;
  requires: Capability[];
  base: DoStep;
  watchers: Watcher[];
  reactions: Reaction[];
  safeStop: string;
}

export interface TransitionProof {
  seeds: number;
  falls: number;
  modelHash: string;
}

export interface SkillContract {
  id: string;
  status: 'ready' | 'needsTraining';
  rateHz: 50;
  holds: Resource[];
  startsFrom: string[];
  endsIn: string;
  interrupt: 'any' | 'atPhase' | 'never';
  stopVia: string;
  transitions: Record<string, TransitionProof>;
}

export interface RoutineError {
  code: string;
  message: string;
  path?: string;
}

export const isGuarded = (step: Step): step is GuardedStep => step.kind !== 'if' && step.kind !== 'together';

export function childSequences(step: Step): Step[][] {
  switch (step.kind) {
    case 'if':
      return [step.then, step.else];
    case 'together':
      return step.branches;
    default:
      return [step.onTimeout, step.onFail];
  }
}

export function forEachStep(steps: Step[], visit: (step: Step) => void) {
  for (const step of steps) {
    visit(step);

    for (const child of childSequences(step)) forEachStep(child, visit);
  }
}

export function allSteps(routine: Routine): Step[] {
  const found: Step[] = [];
  const collect = (step: Step) => found.push(step);

  forEachStep([routine.base], collect);

  for (const reaction of routine.reactions) forEachStep(reaction.steps, collect);

  return found;
}

export { validateRoutine } from './schemaValidate';
