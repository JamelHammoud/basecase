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
import { HOME_CHECKOUT, HOME_REF, LOCKS, LOGS } from './lib/paths.mjs';
import { run } from './lib/sh.mjs';
import { pause, probe, probeDue, resume, startPause, UsageLimit } from './lib/usage.mjs';

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

const othersRunning = () =>
  fs
    .readdirSync(LOCKS)
    .filter((name) => name !== `${id}.lock`)
    .some((name) => isAlive(Number(fs.readFileSync(path.join(LOCKS, name), 'utf8'))));

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

  if (depsCurrent()) keepIfLoads({ before, target });

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

function depsCurrent() {
  const stampFile = path.join(HOME_CHECKOUT, 'node_modules', '.loop-lock-hash');
  const hash = lockHash(HOME_CHECKOUT);
  const current = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8') : '';

  if (current === hash) return true;

  if (othersRunning()) return false;

  log('package-lock.json changed; installing');
  run('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: HOME_CHECKOUT,
    timeout: 30 * 60 * 1000,
    env: { ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
  });
  fs.writeFileSync(stampFile, hash);

  return true;
}

const localTime = (at) => new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function agentsMayRun() {
  const paused = pause();

  if (!paused || Date.now() >= paused.until) return true;

  const release = probeDue() ? claim('usage-probe') : null;

  if (!release) return false;

  try {
    const limit = probe();

    if (!limit) {
      resume();
      log('usage is back; agent lanes resume');

      return true;
    }

    startPause(limit.until);
    log(`still at the usage limit; paused until ${localTime(Math.max(limit.until, paused.until))}`);

    return false;
  } finally {
    release();
  }
}

function announcePause(error) {
  log(`usage limit reached; agent lanes paused until ${localTime(error.until)}`);

  if (!error.started) return;

  const direction = issues('loop:direction')[0];

  if (!direction) return;

  commentOnIssue(
    direction.number,
    `The loop hit the Claude usage limit, so its agent lanes are paused until ${localTime(error.until)}. Merging and tidying keep running. They resume on their own when the limit resets, or within 15 minutes of a manual reset; \`node tools/loop/usage.mjs resume\` restarts them at once.`,
  );
}

async function runOnce() {
  const { default: runLane, schedule } = await laneModule(lane);
  const held = PRODUCERS.has(lane) ? backpressure(flowCounts()) : null;

  if (held) log(`waiting: ${held}`);
  else if (!schedule.agent || agentsMayRun()) await runLane({ log, slot });
}

const runsFromHome = path.resolve(import.meta.dirname, '..', '..') === path.resolve(HOME_CHECKOUT);
const startedAt = Date.now();
const LONG_RUN_MINUTES = 2;

try {
  const updated = runsFromHome && lane === 'merge' && updateHome();

  if (updated) {
    spawn(process.execPath, [path.join(HOME_CHECKOUT, 'tools', 'loop', 'install.mjs'), 'sync', String(process.pid)], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }

  if (updated) log('updated to the latest main; the next run uses it');
  else await runOnce();
} catch (error) {
  if (error instanceof UsageLimit) announcePause(error);
  else {
    log(`failed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  }
}

const minutes = Math.round((Date.now() - startedAt) / 60_000);

if (minutes >= LONG_RUN_MINUTES) log(`took ${minutes} min`);
