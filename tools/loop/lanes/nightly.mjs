import { isPaused } from '../lib/github.mjs';
import { nextVersion, releaseDue, rerunSuite, suiteDue } from '../lib/nightly.mjs';
import { json, run } from '../lib/sh.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 900,
  does: "Starts the full suite when GitHub's schedule skips it, reruns a failed suite once fixes land, and releases the newest commit it passed once a day, as Jamel",
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

const lastTag = () =>
  json('gh', [
    'release',
    'list',
    '--exclude-drafts',
    '--exclude-pre-releases',
    '--limit',
    '1',
    '--json',
    'tagName',
  ])?.[0]?.tagName ?? null;

const newestGreen = () => runs('check.yml', ['--branch', 'main', '--status', 'success'])[0]?.headSha ?? null;

const ahead = (from, to) =>
  run('gh', ['api', `repos/{owner}/{repo}/compare/${from}...${to}`, '--jq', '.status'], {
    allowFail: true,
  }).out.trim() === 'ahead';

function release(log, now) {
  const attempts = runs('release.yml');
  const running = attempts.some((r) => r.status !== 'completed');

  if (!releaseDue({ now, lastReleaseAt: lastRelease(), lastAttemptAt: attempts[0]?.createdAt ?? null, running }))
    return;

  const tag = lastTag();
  const green = newestGreen();

  if (!tag || !green || !ahead(tag, green))
    return log('nothing that passed the full suite is newer than the last release');

  const version = nextVersion(tag);
  const args = [
    'workflow',
    'run',
    'release.yml',
    '--ref',
    'main',
    '-f',
    `version=${version}`,
    '-f',
    `ref=${green}`,
    '-f',
    'release=true',
  ];

  if (run('gh', args, { allowFail: true }).ok)
    log(`releasing ${version} from ${green.slice(0, 7)}, the newest commit the full suite passed`);
}

export default function nightly({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const now = Date.now();

  suite(log, now);
  release(log, now);
}
