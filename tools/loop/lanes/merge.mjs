import { checkConclusion, isPaused, latestMainCheck, mergePull, openPulls, reviewState } from '../lib/github.mjs';

const isRepair = (pull) => pull.headRefName.startsWith('loop/repair/');

const ready = (pull) =>
  pull.mergeable !== 'CONFLICTING' &&
  checkConclusion(pull.headRefOid) === 'success' &&
  reviewState(pull.headRefOid) === 'success';

export default function merge({ log }) {
  if (isPaused()) {
    log('paused (LOOP_PAUSED)');

    return;
  }

  const mainRed = latestMainCheck()?.conclusion === 'failure';
  const candidates = openPulls().filter((pull) => !mainRed || isRepair(pull));
  const pull = candidates.find(ready);

  if (!pull) {
    log(mainRed ? 'main is red; waiting for a green repair' : 'nothing ready to merge');

    return;
  }

  const result = mergePull(pull.number);

  log(result.ok ? `merged #${pull.number}: ${pull.title}` : `merge of #${pull.number} failed: ${result.err}`);
}
