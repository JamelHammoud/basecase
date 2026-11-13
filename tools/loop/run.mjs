import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { heldLocks, isAlive, lockHolder } from './lib/locks.mjs';
import { HOME_CHECKOUT, HOME_REF, LOCKS, LOGS } from './lib/paths.mjs';
import { run } from './lib/sh.mjs';

const LANES = ['review', 'merge', 'rebase', 'repair', 'build', 'refine', 'lead', 'update', 'learn', 'digest', 'tidy'];
const [lane, slot = '1'] = process.argv.slice(2);

if (!LANES.includes(lane)) {
  console.error(`Usage: node tools/loop/run.mjs <${LANES.join('|')}> [slot]`);
  process.exit(2);
}

const id = lane === 'build' ? `${lane}-${slot}` : lane;

fs.mkdirSync(LOCKS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

const log = (message) =>
  fs.appendFileSync(path.join(LOGS, `${lane}.log`), `${new Date().toISOString()} [${id}] ${message}\n`);

const lockFile = path.join(LOCKS, `${id}.lock`);
const holder = lockHolder(lockFile);

if (holder && isAlive(holder)) process.exit(0);

fs.writeFileSync(lockFile, String(process.pid));
process.on('exit', () => fs.rmSync(lockFile, { force: true }));

const lockHash = (dir) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(dir, 'package-lock.json')))
    .digest('hex');

const othersRunning = () => heldLocks().some((held) => held !== id);

function updateHome() {
  run('git', ['fetch', '-q', 'origin', 'main', HOME_REF], { cwd: HOME_CHECKOUT });
  run('git', ['reset', '-q', '--hard', `origin/${HOME_REF}`], { cwd: HOME_CHECKOUT });

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

const runsFromHome = path.resolve(import.meta.dirname, '..', '..') === path.resolve(HOME_CHECKOUT);

try {
  if (runsFromHome && lane === 'merge') updateHome();

  const lanePath = path.join(import.meta.dirname, 'lanes', `${lane}.mjs`);
  const { default: runLane } = await import(pathToFileURL(lanePath).href);

  await runLane({ log, slot });
} catch (error) {
  log(`failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
}
