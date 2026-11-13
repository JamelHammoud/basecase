import {
  checkConclusion,
  failingJobs,
  isPaused,
  latestMainCheck,
  mergePull,
  openPulls,
  reviewState,
} from '../lib/github.mjs';

const isRepair = (pull) => pull.headRefName.startsWith('loop/repair/');

const addsNoFailures = (pull, mainFailures) => failingJobs(pull.headRefOid).every((job) => mainFailures.includes(job));

const greenEnough = (pull, main) => {
  const conclusion = checkConclusion(pull.headRefOid);

  if (conclusion === 'success') return true;

  return main.red && conclusion === 'failure' && addsNoFailures(pull, main.failures);
};

const ready = (pull, main) =>
  pull.mergeable !== 'CONFLICTING' && reviewState(pull.headRefOid) === 'success' && greenEnough(pull, main);

export default function merge({ log }) {
  if (isPaused()) {
    log('paused (LOOP_PAUSED)');

    return;
  }

  const latest = latestMainCheck();
  const mainRed = latest?.conclusion === 'failure';
  const main = { red: mainRed, failures: mainRed ? failingJobs(latest.headSha) : [] };
  const candidates = openPulls().filter((pull) => !mainRed || isRepair(pull));
  const pull = candidates.find((candidate) => ready(candidate, main));

  if (!pull) {
    log(mainRed ? 'main is red; waiting for a green repair' : 'nothing ready to merge');

    return;
  }

  const result = mergePull(pull.number);

  log(result.ok ? `merged #${pull.number}: ${pull.title}` : `merge of #${pull.number} failed: ${result.err}`);
}
