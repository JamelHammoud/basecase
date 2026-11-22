import { PRODUCERS } from './flow.mjs';
import { openPulls, hasLabel } from './github.mjs';
import { codexPause, isActive } from './usage.mjs';

const LIVE = { held: () => isActive(codexPause()), pulls: openPulls };

export function repairOverflowHold(lane, dependencies = LIVE) {
  if (!PRODUCERS.has(lane) || !dependencies.held()) return null;

  const repair = dependencies.pulls().find((pull) => hasLabel(pull, 'loop:repair'));

  return repair ? `repair #${repair.number} needs the protected overflow session` : null;
}
