import { isPaused } from '../lib/github.mjs';
import { nightlyDue, rerunSuite, retryRelease, suiteDue } from '../lib/nightly.mjs';
import { json, run } from '../lib/sh.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 900,
  does: "Starts the nightly full suite and release when GitHub's schedule skips them, reruns a failed suite once fixes land, and retries the release until one goes out",
};

const runs = (workflow, extra = []) =>
  json('gh', [
    'run',
    'list',
    '--workflow',
    workflow,
    ...extra,
    '--limit',
    '5',
    '--json',
    'createdAt,status,conclusion,headSha',
  ]) ?? [];

const mainHead = () =>
  run('gh', ['api', 'repos/{owner}/{repo}/commits/main', '--jq', '.sha'], { allowFail: true }).out.trim();

const lastRelease = () =>
  json('gh', ['release', 'list', '--exclude-drafts', '--limit', '1', '--json', 'createdAt'])?.[0]?.createdAt ?? null;

const dispatch = (workflow) => run('gh', ['workflow', 'run', workflow, '--ref', 'main'], { allowFail: true }).ok;

function suite(log, now) {
  const mainRuns = runs('check.yml', ['--branch', 'main']);
  const running = mainRuns.some((r) => r.status !== 'completed');
  const last = mainRuns.find((r) => r.status === 'completed') ?? null;

  if (!running && suiteDue(new Date(now), mainRuns[0]?.createdAt ?? null) && dispatch('check.yml'))
    return log("GitHub's schedule skipped tonight's full suite; started it");

  if (rerunSuite({ now, last, mainHead: mainHead(), running }) && dispatch('check.yml'))
    log('the full suite failed and fixes have landed since; running it again');
}

function release(log, now) {
  const lastNightlyAt = runs('nightly.yml')[0]?.createdAt ?? null;
  const skipped = nightlyDue(new Date(now), lastNightlyAt);
  const retry = !skipped && retryRelease({ now, lastReleaseAt: lastRelease(), lastNightlyAt });

  if (!(skipped || retry) || !dispatch('nightly.yml')) return;

  log(
    skipped
      ? "GitHub's schedule skipped the nightly release; started it"
      : 'no release went out today; trying the nightly release again',
  );
}

export default function nightly({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const now = Date.now();

  suite(log, now);
  release(log, now);
}
