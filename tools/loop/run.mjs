import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { backpressure, PRODUCERS } from './lib/flow.mjs';
import { flowCounts } from './lib/flowCounts.mjs';
import { laneNames, laneModule } from './lib/lanes.mjs';
import { claim } from './lib/claim.mjs';
import { commentOnIssue, createIssue, issues } from './lib/github.mjs';
import { firstLine, isBad, LOAD_CHECK, markBad } from './lib/homeGuard.mjs';
import { HOME_CHECKOUT, HOME_REF, LOCKS, LOGS, LOOP_DIR } from './lib/paths.mjs';
import { run } from './lib/sh.mjs';
import { CODEX_EFFORT, CODEX_MODEL } from './lib/codex.mjs';
import {
  codexPause,
  isActive,
  markAnnounced,
  pause,
  probe,
  probeDue,
  resume,
  startPause,
  UsageLimit,
} from './lib/usage.mjs';

const LANES = laneNames();
const [lane, slot = '1'] = process.argv.slice(2);

if (!LANES.includes(lane)) {
  console.error(`Usage: node tools/loop/run.mjs <${LANES.join('|')}> [slot]`);
  process.exit(2);
}

const id = `${lane}-${slot}`;

fs.mkdirSync(LOCKS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

const log = (message) =>
  fs.appendFileSync(path.join(LOGS, `${lane}.log`), `${new Date().toISOString()} [${id}] ${message}\n`);

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

const lockFile = path.join(LOCKS, `${id}.lock`);
const holder = fs.existsSync(lockFile) ? Number(fs.readFileSync(lockFile, 'utf8')) : 0;

if (holder && isAlive(holder)) process.exit(0);

fs.writeFileSync(lockFile, String(process.pid));
process.on('exit', () => fs.rmSync(lockFile, { force: true }));

const lockHash = (dir) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(dir, 'package-lock.json')))
    .digest('hex');

const DEPS_STAGING = path.join(LOOP_DIR, 'deps-staging');

function updateHome() {
  const exists = run('git', ['ls-remote', '--exit-code', '--heads', 'origin', HOME_REF], {
    cwd: HOME_CHECKOUT,
    allowFail: true,
  }).ok;
  const ref = exists ? HOME_REF : 'main';

  const before = run('git', ['rev-parse', 'HEAD'], { cwd: HOME_CHECKOUT }).out.trim();

  run('git', ['fetch', '-q', 'origin', ref], { cwd: HOME_CHECKOUT });

  const target = run('git', ['rev-parse', `origin/${ref}`], { cwd: HOME_CHECKOUT }).out.trim();

  if (target === before || isBad(target)) return false;

  run('git', ['reset', '-q', '--hard', target], { cwd: HOME_CHECKOUT });
  syncDeps();
  keepIfLoads({ before, target });

  return true;
}

function keepIfLoads({ before, target }) {
  const loads = run(process.execPath, ['--input-type=module', '-e', LOAD_CHECK], {
    cwd: HOME_CHECKOUT,
    timeout: 2 * 60 * 1000,
    allowFail: true,
  });

  if (loads.ok) return;

  const why = firstLine(loads.err || loads.out);

  run('git', ['reset', '-q', '--hard', before], { cwd: HOME_CHECKOUT });
  markBad(target);
  log(`main at ${target.slice(0, 7)} breaks the loop's own code (${why}); staying on ${before.slice(0, 7)}`);
  createIssue({
    title: `Fix: The loop's code on main fails to load: ${why.slice(0, 120)}`,
    body: `Kind: fix\n\nThe merge lane updated its checkout to ${target} and loading tools/loop failed, so the loop stays on ${before} until main has a commit that loads.\n\n\`\`\`\n${(loads.err || loads.out).slice(0, 4000)}\n\`\`\``,
    labels: ['loop:next', 'loop:fix', 'loop:priority'],
  });
}

function keepCaches(from, to) {
  const caches = fs.existsSync(from) ? fs.readdirSync(from).filter((name) => name.startsWith('.')) : [];

  for (const name of caches.filter((cache) => !fs.existsSync(path.join(to, cache)))) {
    fs.renameSync(path.join(from, name), path.join(to, name));
  }
}

function swapIn(staged) {
  const modules = path.join(HOME_CHECKOUT, 'node_modules');
  const old = path.join(DEPS_STAGING, 'old');

  keepCaches(modules, staged);

  if (fs.existsSync(modules)) fs.renameSync(modules, old);

  fs.renameSync(staged, modules);
  fs.rmSync(DEPS_STAGING, { recursive: true, force: true });
}

function syncDeps() {
  const stampFile = path.join(HOME_CHECKOUT, 'node_modules', '.loop-lock-hash');
  const hash = lockHash(HOME_CHECKOUT);
  const current = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8') : '';

  if (current === hash) return false;

  log('package-lock.json changed; installing');
  fs.rmSync(DEPS_STAGING, { recursive: true, force: true });
  fs.mkdirSync(DEPS_STAGING, { recursive: true });

  for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
    const from = path.join(HOME_CHECKOUT, file);

    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(DEPS_STAGING, file));
  }

  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: DEPS_STAGING,
    timeout: 30 * 60 * 1000,
    env: { ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
  });
  fs.writeFileSync(path.join(DEPS_STAGING, 'node_modules', '.loop-lock-hash'), hash);
  swapIn(path.join(DEPS_STAGING, 'node_modules'));
  run('npm', ['run', 'prepare'], { cwd: HOME_CHECKOUT, allowFail: true });
  log('installed the new dependencies');

  return true;
}

const localTime = (at) => new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function tellDirection(text) {
  const direction = issues('loop:direction')[0];

  if (direction) commentOnIssue(direction.number, text);
}

function claudeIsBack() {
  const release = probeDue() ? claim('usage-probe') : null;

  if (!release) return false;

  try {
    const limit = probe();

    if (limit) {
      startPause(limit.until);

      return false;
    }

    resume();

    return true;
  } finally {
    release();
  }
}

function agentsMayRun() {
  const claude = pause();

  if (!claude) return true;

  if (claudeIsBack()) {
    log('Claude is back; agent lanes run on Claude again');
    tellDirection('Claude is back, so the agent lanes run on Claude again.');

    return true;
  }

  return !(isActive(claude) && isActive(codexPause()));
}

function announceCodex() {
  const claude = pause();

  if (!claude || claude.announced) return;

  markAnnounced();
  log(
    `Claude hit its usage limit; agent lanes run on Codex (${CODEX_MODEL}, ${CODEX_EFFORT}) until ${localTime(claude.until)}`,
  );
  tellDirection(
    `Claude hit its usage limit, so the agent lanes run on Codex (${CODEX_MODEL}, ${CODEX_EFFORT} effort) until ${localTime(claude.until)}, when Claude's limit resets. A manual reset is picked up within 15 minutes.`,
  );
}

function announcePause(error) {
  log(`Claude and Codex are both at their usage limits; agent lanes paused until ${localTime(error.until)}`);

  if (error.started)
    tellDirection(
      `Claude and Codex both hit their usage limits, so the agent lanes are paused until ${localTime(error.until)}. Merging and tidying keep running. They resume on their own, or within 15 minutes of a manual reset; \`node tools/loop/usage.mjs resume\` restarts them at once.`,
    );
}

async function runOnce() {
  const { default: runLane, schedule } = await laneModule(lane);
  const held = PRODUCERS.has(lane) ? backpressure(flowCounts(), lane) : null;

  if (held) log(`waiting: ${held}`);
  else if (!schedule.agent || agentsMayRun()) await runLane({ log, slot });
}

const runsFromHome = path.resolve(import.meta.dirname, '..', '..') === path.resolve(HOME_CHECKOUT);
const startedAt = Date.now();
const LONG_RUN_MINUTES = 2;

try {
  const tending = runsFromHome && lane === 'merge';
  const updated = tending && updateHome();
  const installed = tending && !updated && syncDeps();

  if (updated) {
    spawn(process.execPath, [path.join(HOME_CHECKOUT, 'tools', 'loop', 'install.mjs'), 'sync', String(process.pid)], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }

  if (updated) log('updated to the latest main; the next run uses it');
  else if (!installed) await runOnce();
} catch (error) {
  if (error instanceof UsageLimit) announcePause(error);
  else {
    log(`failed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  }
}

announceCodex();

const minutes = Math.round((Date.now() - startedAt) / 60_000);

if (minutes >= LONG_RUN_MINUTES) log(`took ${minutes} min`);
