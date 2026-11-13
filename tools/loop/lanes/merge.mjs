import { byRank, isRepair } from '../lib/rank.mjs';
import { isBatch, landStep } from '../lib/landing.mjs';
import {
  closeIssue,
  fullCheck,
  hasLabel,
  isPaused,
  issueIsOpen,
  lastFinishedMainCheck,
  mergePull,
  openPulls,
  pullReview,
  quickCheck,
} from '../lib/github.mjs';
import { json, run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: 'Starts the full Check on each reviewed pull request whose quick Check passed and merges it the moment that passes, repairs first; only repairs while main is red',
};

const REDISPATCH_MS = 45 * 60 * 1000;
const started = store('landing', {});

const builtStep = (pull) => Number(/^loop\/build\/(\d+)-/.exec(pull.headRefName)?.[1]) || null;

function closeBuiltStep(pull, log) {
  const step = builtStep(pull);

  if (!step || !issueIsOpen(step)) return;

  closeIssue(step, `Built in #${pull.number}.`);
  log(`closed step #${step}, built in #${pull.number}`);
}

function stepFor(pull, dispatched) {
  return landStep({
    repair: isRepair(pull),
    conflicting: pull.mergeable === 'CONFLICTING',
    revising: hasLabel(pull, 'loop:revising'),
    review: pullReview(pull),
    quick: quickCheck(pull),
    full: fullCheck(pull),
    dispatched,
  });
}

function land(pull, log) {
  const result = mergePull(pull.number, 'squash');

  log(result.ok ? `merged #${pull.number}: ${pull.title}` : `merge of #${pull.number} failed: ${result.err}`);

  if (result.ok) closeBuiltStep(pull, log);
}

function startFull(pull, state, log) {
  const ok = run('gh', ['workflow', 'run', 'check.yml', '--ref', pull.headRefName, '-f', `pr=${pull.number}`], {
    allowFail: true,
  }).ok;

  if (ok) state[pull.headRefOid] = Date.now();

  log(ok ? `#${pull.number}: started the full Check` : `#${pull.number}: could not start the full Check`);
}

function redMain(log) {
  const last = lastFinishedMainCheck();

  if (last?.conclusion !== 'failure') return false;

  const attempt = json('gh', ['run', 'view', String(last.databaseId), '--json', 'attempt'])?.attempt ?? 1;

  if (attempt < 2 && run('gh', ['run', 'rerun', String(last.databaseId), '--failed'], { allowFail: true }).ok)
    log('main is red; re-running its failed jobs once to rule out a flake');

  return true;
}

export default function merge({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const mainRed = redMain(log);
  const state = started.get('state');
  const now = Date.now();
  const pulls = openPulls({ fresh: true })
    .filter((pull) => !isBatch(pull) && (isRepair(pull) || !mainRed))
    .sort(byRank);
  let acted = false;

  for (const pull of pulls) {
    const dispatched = now - (state[pull.headRefOid] ?? 0) < REDISPATCH_MS;
    const next = stepFor(pull, dispatched);

    if (next === 'merge') land(pull, log);

    if (next === 'start full') startFull(pull, state, log);

    acted ||= next !== 'wait';
  }

  if (!acted) log(mainRed ? 'main is red; only repairs land until a repair turns it green' : 'nothing ready to land');

  for (const sha of Object.keys(state)) if (now - state[sha] > 24 * 3_600_000) delete state[sha];

  started.save('state', state);
}
