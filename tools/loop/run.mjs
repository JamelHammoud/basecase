import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { laneNames, laneModule } from './lib/lanes.mjs';
import { HOME_CHECKOUT, HOME_REF, LOCKS, LOGS } from './lib/paths.mjs';
import { run } from './lib/sh.mjs';

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

const runsFromHome = path.resolve(import.meta.dirname, '..', '..') === path.resolve(HOME_CHECKOUT);

try {
  if (runsFromHome && lane === 'merge') updateHome();

  const { default: runLane } = await laneModule(lane);

  await runLane({ log, slot });
} catch (error) {
  log(`failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
}
