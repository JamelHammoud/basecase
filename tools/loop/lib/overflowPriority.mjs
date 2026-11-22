import { PRODUCERS } from './flow.mjs';
import { openPulls, hasLabel, lastFinishedMainCheck } from './github.mjs';
import { codexPause, isActive } from './usage.mjs';

const LIVE = { held: () => isActive(codexPause()), pulls: openPulls, check: lastFinishedMainCheck };

export function repairOverflowHold(lane, dependencies = LIVE) {
  if (!PRODUCERS.has(lane) || !dependencies.held()) return null;

  const repair = dependencies.pulls().find((pull) => hasLabel(pull, 'loop:repair'));

  if (repair) return `repair #${repair.number} needs the protected overflow session`;

  return dependencies.check?.()?.conclusion === 'failure'
    ? 'main is red, so recovery keeps the protected overflow session'
    : null;
}
