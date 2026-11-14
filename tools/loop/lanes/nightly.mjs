import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

const repairMergedSince = (since) =>
  (
    json('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--base',
      'main',
      '--label',
      'loop:repair',
      '--search',
      `merged:>${since}`,
      '--limit',
      '1',
      '--json',
      'mergedAt',
    ]) ?? []
  ).length > 0;

function suite(log, now) {
  const mainRuns = runs('check.yml', ['--branch', 'main']);
  const running = mainRuns.some((r) => r.status !== 'completed');
  const last = mainRuns.find((r) => r.status === 'completed') ?? null;

  if (!running && suiteDue(new Date(now), mainRuns[0]?.createdAt ?? null) && dispatch('check.yml'))
    return log("GitHub's schedule skipped tonight's full suite; started it");

  const rerun = rerunSuite({
    now,
    last,
    mainHead: mainHead(),
    running,
    repairMerged: () => repairMergedSince(last.createdAt),
  });

  if (rerun && dispatch('check.yml')) log('the full suite failed and fixes have landed since; running it again');
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

const releases = store('release', { tried: [], pending: null });

const releaseRuns = () =>
  json('gh', ['run', 'list', '--workflow', 'release.yml', '--limit', '5', '--json', 'databaseId,createdAt,status']) ??
  [];

const jobsOf = (id) =>
  json('gh', ['run', 'view', String(id), '--json', 'jobs'])?.jobs?.map((job) => [job.name, job.conclusion]) ?? [];

const RELEASE_BUILDS = ['mac', 'windows', 'daemon-linux-arm64', 'daemon-linux-x64'];
const RELEASE_ARTIFACTS = ['mac', 'windows', 'robot-daemon-linux-arm64', 'robot-daemon-linux-x64'];

function publish(pending, log) {
  const started = releaseRuns().find((r) => r.createdAt >= pending.dispatchedAt);

  if (!started || started.status !== 'completed') return false;

  const jobs = Object.fromEntries(jobsOf(started.databaseId));

  if (RELEASE_BUILDS.some((name) => jobs[name] !== 'success')) {
    const results = RELEASE_BUILDS.map((name) => `${name} ${jobs[name]}`).join(', ');

    log(`the ${pending.version} build failed (${results}), so the next suite pass tries again`);

    return true;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-release-'));

  try {
    run('gh', ['run', 'download', String(started.databaseId), '-D', dir]);

    const files = RELEASE_ARTIFACTS.flatMap((name) =>
      fs.readdirSync(path.join(dir, name)).map((file) => path.join(dir, name, file)),
    );
    const tag = `v${pending.version}`;
    const args = [
      'release',
      'create',
      tag,
      '--target',
      pending.ref,
      '--title',
      `Basecase ${pending.version}`,
      '--generate-notes',
      ...files,
    ];

    log(run('gh', args, { allowFail: true }).ok ? `published ${tag}` : `couldn't publish ${tag}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return true;
}

function settle(state, log) {
  if (publish(state.pending, log)) releases.save('state', { ...state, pending: null });
}

function release(log, now) {
  const state = releases.get('state');

  if (state.pending) return settle(state, log);

  const green = newestSuitePass();
  const running = releaseRuns().some((r) => r.status !== 'completed');

  if (!releaseDue({ now, green, tried: state.tried, lastReleaseAt: lastRelease(), running })) return;

  const tag = lastTag();

  if (!tag || !ahead(tag, green)) return;

  const version = nextVersion(tag);
  const args = ['workflow', 'run', 'release.yml', '--ref', 'main', '-f', `version=${version}`, '-f', `ref=${green}`];
  const pending = { version, ref: green, dispatchedAt: new Date(now).toISOString() };

  releases.save('state', { tried: [...state.tried, green].slice(-50), pending });

  if (run('gh', args, { allowFail: true }).ok)
    log(`the full suite passed on ${green.slice(0, 7)}; building ${version}`);
}

export default function nightly({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const now = Date.now();

  suite(log, now);
  release(log, now);
}
