import type { Routine, Step } from './schema';
import { isGuarded } from './schema';

const MAX_RUN_S = 60;
const SLACK_S = 3;

function longest(steps: readonly Step[]): number {
  return steps.reduce((total, step) => total + stepMs(step), 0);
}

function stepMs(step: Step): number {
  if (isGuarded(step)) return step.timeoutMs;

  if (step.kind === 'if') return Math.max(longest(step.then), longest(step.else));

  return Math.max(0, ...step.branches.map(longest));
}

export function runSeconds(routine: Routine): number {
  const ms = routine.base.timeoutMs + longest(routine.base.onTimeout);

  return Math.min(MAX_RUN_S, Math.ceil(ms / 1000 + SLACK_S));
}
