import { byRank, isRepair } from '../lib/rank.mjs';
import { isBatch } from './batch.mjs';
import {
  closeIssue,
  isPaused,
  issueIsOpen,
  lastFinishedMainCheck,
  mergePull,
  openPulls,
  pullCheck,
  pullReview,
} from '../lib/github.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: 'Lands what the full Check passed: repairs first, squashed, then batches with a merge commit so every pull request in them is marked merged; only repairs while main is red',
};

const ready = (pull) =>
  pull.mergeable !== 'CONFLICTING' && pullCheck(pull) === 'success' && pullReview(pull) === 'success';

const builtStep = (pull) => Number(/^loop\/build\/(\d+)-/.exec(pull.headRefName)?.[1]) || null;

function closeBuiltStep(pull, log) {
  const step = builtStep(pull);

  if (!step || !issueIsOpen(step)) return;

  closeIssue(step, `Built in #${pull.number}.`);
  log(`closed step #${step}, built in #${pull.number}`);
}

export default function merge({ log }) {
  if (isPaused()) {
    log('paused (LOOP_PAUSED)');

    return;
  }

  const mainRed = lastFinishedMainCheck()?.conclusion === 'failure';
  const candidates = openPulls({ fresh: true })
    .filter((pull) => isRepair(pull) || (!mainRed && isBatch(pull)))
    .sort(byRank);
  const pull = candidates.find(ready);

  if (!pull) {
    log(mainRed ? 'main is red; waiting for a repair that turns Check green' : 'nothing ready to merge');

    return;
  }

  const result = mergePull(pull.number, isBatch(pull) ? 'merge' : 'squash');

  log(result.ok ? `merged #${pull.number}: ${pull.title}` : `merge of #${pull.number} failed: ${result.err}`);

  if (result.ok) closeBuiltStep(pull, log);
}
