import { byRank, isRepair } from '../lib/rank.mjs';
import { isBatch, ready } from '../lib/landing.mjs';
import {
  closeIssue,
  hasLabel,
  isPaused,
  issueIsOpen,
  mergePull,
  openPulls,
  pullCheck,
  pullReview,
} from '../lib/github.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: "Squash-merges every reviewed pull request whose Check passed, repairs first; main's state never holds a merge",
};

const builtStep = (pull) => Number(/^loop\/build\/(\d+)-/.exec(pull.headRefName)?.[1]) || null;

function closeBuiltStep(pull, log) {
  const step = builtStep(pull);

  if (!step || !issueIsOpen(step)) return;

  closeIssue(step, `Built in #${pull.number}.`);
  log(`closed step #${step}, built in #${pull.number}`);
}

const landable = (pull) =>
  !isBatch(pull) &&
  ready({
    conflicting: pull.mergeable === 'CONFLICTING',
    revising: hasLabel(pull, 'loop:revising'),
    review: pullReview(pull),
    check: pullCheck(pull),
  });

export default function merge({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const pulls = openPulls({ fresh: true })
    .filter(landable)
    .sort((a, b) => Number(isRepair(b)) - Number(isRepair(a)) || byRank(a, b));

  if (pulls.length === 0) return log('nothing ready to land');

  for (const pull of pulls) {
    const result = mergePull(pull.number, 'squash');

    log(result.ok ? `merged #${pull.number}: ${pull.title}` : `merge of #${pull.number} failed: ${result.err}`);

    if (result.ok) closeBuiltStep(pull, log);
  }
}
