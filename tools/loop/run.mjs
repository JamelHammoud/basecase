import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { backpressure, PRODUCERS } from './lib/flow.mjs';
import { flowCounts } from './lib/flowCounts.mjs';
import { laneNames, laneModule } from './lib/lanes.mjs';
import { claim } from './lib/claim.mjs';
import { commentOnIssue, issues } from './lib/github.mjs';
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

  run('git', ['fetch', '-q', 'origin', ref], { cwd: HOME_CHECKOUT });
  run('git', ['reset', '-q', '--hard', `origin/${ref}`], { cwd: HOME_CHECKOUT });

  const stampFile = path.join(HOME_CHECKOUT, 'node_modules', '.loop-lock-hash');
  const hash = lockHash(HOME_CHECKOUT);
  const current = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8') : '';

  if (current === hash || othersRunning()) return;

  log('package-lock.json changed; installing');
  run('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: HOME_CHECKOUT,
    timeout: 30 * 60 * 1000,
    env: { ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
  });
  fs.writeFileSync(stampFile, hash);
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

const runsFromHome = path.resolve(import.meta.dirname, '..', '..') === path.resolve(HOME_CHECKOUT);

try {
  if (runsFromHome && lane === 'merge') {
    updateHome();
    spawn(process.execPath, [path.join(HOME_CHECKOUT, 'tools', 'loop', 'install.mjs'), 'sync', String(process.pid)], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }

  const { default: runLane, schedule } = await laneModule(lane);

  const held = PRODUCERS.has(lane) ? backpressure(flowCounts()) : null;

  if (held) log(`waiting: ${held}`);
  else if (!schedule.agent || agentsMayRun()) await runLane({ log, slot });
} catch (error) {
  if (error instanceof UsageLimit) announcePause(error);
  else {
    log(`failed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  }
}
