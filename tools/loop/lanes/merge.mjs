import {
  checkConclusion,
  hasLabel,
  isPaused,
  lastFinishedMainCheck,
  mergePull,
  openPulls,
  reviewState,
} from '../lib/github.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: "Squash-merges green, reviewed pull requests: repairs first, then the loop's own, then loop:priority, then the oldest; only repairs while main is red",
};

const isRepair = (pull) => pull.headRefName.startsWith('loop/repair/');

const rank = (pull) => {
  if (isRepair(pull)) return 0;

  if (pull.headRefName.startsWith('loop/loop/') || hasLabel(pull, 'loop:loop')) return 1;

  return hasLabel(pull, 'loop:priority') ? 2 : 3;
};

const byRank = (a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt);

const ready = (pull) =>
  pull.mergeable !== 'CONFLICTING' &&
  checkConclusion(pull.headRefOid) === 'success' &&
  reviewState(pull.headRefOid) === 'success';

export default function merge({ log }) {
  if (isPaused()) {
    log('paused (LOOP_PAUSED)');

    return;
  }

  const mainRed = lastFinishedMainCheck()?.conclusion === 'failure';
  const candidates = openPulls()
    .filter((pull) => !mainRed || isRepair(pull))
    .sort(byRank);
  const pull = candidates.find(ready);

  if (!pull) {
    log(mainRed ? 'main is red; waiting for a repair that turns Check green' : 'nothing ready to merge');

    return;
  }

  const result = mergePull(pull.number);

  log(result.ok ? `merged #${pull.number}: ${pull.title}` : `merge of #${pull.number} failed: ${result.err}`);
}
