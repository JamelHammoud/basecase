import { byRank, isRepair } from '../lib/rank.mjs';
import { isPaused, lastFinishedMainCheck, mergePull, openPulls, pullCheck, pullReview } from '../lib/github.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: "Squash-merges green, reviewed pull requests: repairs first, then the loop's own, then loop:priority, then the oldest; only repairs while main is red",
};

const ready = (pull) =>
  pull.mergeable !== 'CONFLICTING' && pullCheck(pull) === 'success' && pullReview(pull) === 'success';

export default function merge({ log }) {
  if (isPaused()) {
    log('paused (LOOP_PAUSED)');

    return;
  }

  const mainRed = lastFinishedMainCheck()?.conclusion === 'failure';
  const candidates = openPulls({ fresh: true })
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
