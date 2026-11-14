import type { RollOutState } from './rollOut';

function outcome(state: RollOutState, unit: string): string {
  if (unit in state.held) return `held back: ${state.held[unit] || 'its twin failed Arena'}`;

  if (state.reached.includes(unit)) return `runs ${state.skill.label} at Rehearse`;

  if (unit in state.failures) return state.failures[unit] || 'The robot couldn’t run the skill.';

  return 'kept its version';
}

export function rollOutText(state: RollOutState): string {
  const lines = Object.values(state.verdicts).map(
    (v) => `${v.unit}: ${v.passes} of ${v.trials} in its twin, ${outcome(state, v.unit)}.`,
  );
  const stopped = state.stopped
    ? [`Stopped at ${state.stopped.unit}: ${state.stopped.message || 'The robot couldn’t run the skill.'}`]
    : [];

  return [...lines, ...stopped].join('\n');
}
