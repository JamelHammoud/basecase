import { isPaused } from '../lib/github.mjs';
import { nextVersion, releaseDue, rerunSuite, suiteDue } from '../lib/nightly.mjs';
import { json, run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 900,
  does: "Starts the full suite when GitHub's schedule skips it, reruns a failed suite once fixes land, and releases once a day, as Jamel, right after the suite passes on a commit it hasn't tried",
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

const newestSuitePass = () =>
  (
    json('gh', [
      'run',
      'list',
      '--workflow',
      'check.yml',
      '--branch',
      'main',
      '--status',
      'success',
      '--limit',
      '20',
      '--json',
      'headSha,event',
    ]) ?? []
  ).find((r) => r.event === 'schedule' || r.event === 'workflow_dispatch')?.headSha ?? null;

const ahead = (from, to) =>
  run('gh', ['api', `repos/{owner}/{repo}/compare/${from}...${to}`, '--jq', '.status'], {
    allowFail: true,
  }).out.trim() === 'ahead';

const releases = store('release', { tried: [] });

function release(log, now) {
  const state = releases.get('state');
  const green = newestSuitePass();
  const running = runs('release.yml').some((r) => r.status !== 'completed');

  if (!releaseDue({ now, green, tried: state.tried, lastReleaseAt: lastRelease(), running })) return;

  const tag = lastTag();

  if (!tag || !ahead(tag, green)) return;

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

  state.tried = [...state.tried, green].slice(-50);
  releases.save('state', state);

  if (run('gh', args, { allowFail: true }).ok)
    log(`the full suite passed on ${green.slice(0, 7)}; releasing ${version}`);
}

export default function nightly({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const now = Date.now();

  suite(log, now);
  release(log, now);
}
