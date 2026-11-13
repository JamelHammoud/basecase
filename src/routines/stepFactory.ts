import { findNode, type ModelNode } from './nodes';
import type {
  AskStep,
  DoStep,
  IfStep,
  InferStep,
  Motion,
  Resource,
  SayStep,
  TogetherStep,
  WaitStep,
  Watcher,
} from './schema';

export const DRIVE_DEFAULTS = { distance: 1, speed: 0.2, heading: 0 } as const;
export const TURN_DEFAULT_DEG = 90;
export const TURN_RATE_RAD_S = 0.6;
export const WALK_SPEED_M_S = 0.2;

const SLACK_S = 5;
const D2R = Math.PI / 180;

const guard = (timeoutMs: number) => ({ timeoutMs, onTimeout: [], onFail: [] });

export function moveSeconds(move: Motion): number {
  const drive = move.distance === undefined ? 0 : move.distance / (move.speed ?? WALK_SPEED_M_S);
  const turn = move.turn === undefined ? 0 : (Math.abs(move.turn) * D2R) / TURN_RATE_RAD_S;

  return drive + turn;
}

export const moveTimeoutMs = (move: Motion) => Math.round((moveSeconds(move) * 2 + SLACK_S) * 1000);

export function driveStep(id: string, move: Motion = DRIVE_DEFAULTS): DoStep {
  return { kind: 'do', id, skill: 'walk', holds: ['body'], move: { ...move }, ...guard(moveTimeoutMs(move)) };
}

export function turnStep(id: string, turn = TURN_DEFAULT_DEG): DoStep {
  return { kind: 'do', id, skill: 'turn-away', holds: ['body'], move: { turn }, ...guard(moveTimeoutMs({ turn })) };
}

export const stopStep = (id: string, skill = 'settle'): DoStep => ({
  kind: 'do',
  id,
  skill,
  holds: ['body'],
  ...guard(3000),
});

export const skillStep = (id: string, skill: string, holds: Resource[] = ['body']): DoStep => ({
  kind: 'do',
  id,
  skill,
  holds: [...holds],
  ...guard(10_000),
});

export const sayStep = (id: string, text = 'Hello'): SayStep => ({ kind: 'say', id, text, ...guard(5000) });

export const askStep = (id: string): AskStep => ({
  kind: 'ask',
  id,
  prompt: 'Should I keep going?',
  answers: ['Yes', 'No'],
  ...guard(20_000),
});

export const waitTimeoutMs = (ms: number) => ms + 1000;

export const waitStep = (id: string, ms = 1000): WaitStep => ({ kind: 'wait', id, ms, ...guard(waitTimeoutMs(ms)) });

export const ifStep = (id: string, fact = 'person'): IfStep => ({
  kind: 'if',
  id,
  test: { fact, is: true },
  then: [],
  else: [],
});

export const togetherStep = (id: string): TogetherStep => ({ kind: 'together', id, branches: [[], []], join: 'all' });

export function sensorFor(model: ModelNode): string {
  if (model.inputs.includes('image')) return 'camera';

  return model.inputs.includes('audio') ? 'microphone' : 'camera';
}

export function inferStep(id: string, modelId: string): InferStep | null {
  const model = findNode(modelId);
  const type = model?.outputs[0];

  if (!model || model.tier !== 'perception' || !type) return null;

  return { kind: 'infer', id, model: model.id, input: sensorFor(model), output: { type }, ...guard(5000) };
}

export const SENSED_FACTS: ReadonlyArray<{ fact: string; model: string; label: string }> = [
  { fact: 'person', model: 'person-detection', label: 'Sees a person' },
  { fact: 'obstacle', model: 'obstacle-near', label: 'Something is in the way' },
  { fact: 'faces', model: 'face-detection', label: 'Sees a face' },
  { fact: 'objects', model: 'object-detection', label: 'Sees an object' },
  { fact: 'wakeWord', model: 'wake-word', label: 'Hears the wake word' },
];

export function watcherFor(fact: string): Watcher | null {
  const sensed = SENSED_FACTS.find((s) => s.fact === fact);

  if (!sensed) return null;

  return { id: fact, model: sensed.model, rateHz: 10, maxAgeMs: 500, publishes: { type: 'boolean' } };
}
