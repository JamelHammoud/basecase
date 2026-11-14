import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, VERIFY_DIR } from './gate.mjs';
import { requestQuiet } from '../../tools/quiet/quiet.mjs';
import { waitForQuiet } from './lease.mjs';

export const STATUS_FILE = path.join(VERIFY_DIR, 'status.json');
export const MANIFEST_FILE = path.join(VERIFY_DIR, 'manifest.json');

const GATES_DIR = path.join(VERIFY_DIR, 'gates');

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

export const gateFiles = () =>
  fs
    .readdirSync(GATES_DIR)
    .filter((f) => f.endsWith('.mjs'))
    .sort();

export const hashFile = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export const PINNED_FORGE_TESTS = Object.freeze([
  'forge/crates/forge-id/tests/batched.rs',
  'forge/crates/forge-id/tests/identify.rs',
  'forge/crates/forge-reward/tests/rewardlang.rs',
  'forge/crates/forge-sim/tests/common',
  'forge/crates/forge-sim/tests/design_sweep.rs',
  'forge/crates/forge-sim/tests/gradcommon',
  'forge/crates/forge-sim/tests/gradients.rs',
  'forge/crates/forge-sim/tests/qualification.rs',
  'forge/crates/forge-sim/tests/trajectory.rs',
  'forge/crates/forge-train/tests/acceptance_replay.rs',
]);

const UNPINNED = Object.freeze(['verify/out', 'verify/status.json', 'verify/manifest.json']);
const JUNK = new Set(['.DS_Store', '__pycache__', 'node_modules']);

const under = (file, dir) => file === dir || file.startsWith(`${dir}/`);

function filesUnder(relative, root) {
  const full = path.join(root, relative);

  if (UNPINNED.includes(relative) || JUNK.has(path.basename(relative)) || !fs.existsSync(full)) return [];

  if (!fs.statSync(full).isDirectory()) return [relative];

  return fs.readdirSync(full).flatMap((name) => filesUnder(`${relative}/${name}`, root));
}

export const pinnedFiles = (root = ROOT) =>
  ['verify', ...PINNED_FORGE_TESTS].flatMap((r) => filesUnder(r, root)).sort();

export const isPinned = (file) =>
  ['verify', ...PINNED_FORGE_TESTS].some((dir) => under(file, dir)) && !UNPINNED.some((dir) => under(file, dir));

export function currentManifest(root = ROOT) {
  return Object.fromEntries(pinnedFiles(root).map((f) => [f, hashFile(path.join(root, f))]));
}

export function manifestDrift(saved = readJson(MANIFEST_FILE, {}), current = currentManifest()) {
  const names = new Set([...Object.keys(saved), ...Object.keys(current)]);

  return [...names].filter((n) => saved[n] !== current[n]).sort();
}

export async function loadGates() {
  const gates = [];

  for (const f of gateFiles()) {
    const mod = await import(pathToFileURL(path.join(GATES_DIR, f)).href);

    gates.push({ ...mod.default, file: f });
  }

  return gates.sort((a, b) => a.stage - b.stage || a.id.localeCompare(b.id));
}

async function runOne(item) {
  const started = Date.now();

  try {
    const r = await item.run();

    return { name: item.name, ...r, seconds: (Date.now() - started) / 1000 };
  } catch (e) {
    return { name: item.name, ok: false, detail: String(e?.stack ?? e), metrics: {}, seconds: 0 };
  }
}

async function runTimed(item, opts) {
  const release = requestQuiet();

  try {
    return await runQuietly(item, opts);
  } finally {
    release();
  }
}

async function runQuietly(item, { quiet, log }) {
  const before = await quiet({ log });

  if (!before.quiet) {
    return {
      name: item.name,
      ok: false,
      busy: true,
      detail: `Machine stayed busy (load ${before.load.toFixed(1)}), so this timed check didn't run`,
      metrics: {},
      seconds: 0,
    };
  }

  const r = await runOne(item);

  return { ...r, metrics: { ...r.metrics, loadBefore: before.load, loadAfter: os.loadavg()[0] } };
}

const runCheck = (item, opts) => (item.timed ? runTimed(item, opts) : runOne(item));

export function canaryOutcome(result) {
  return {
    ...result,
    ok: !result.ok,
    detail: result.ok
      ? `Canary did not fire: the check passed a planted fault${result.detail ? ` (${result.detail})` : ''}`
      : '',
  };
}

export async function runGate(gate, log = () => {}, quiet = waitForQuiet) {
  const checks = [];
  const canaries = [];

  for (const c of gate.checks) {
    const r = await runCheck(c, { quiet, log });

    checks.push(r);
    log(`  ${r.ok ? 'pass' : 'FAIL'}  ${c.name}${r.detail ? ` (${r.detail.split('\n')[0]})` : ''}`);
  }

  for (const c of gate.canaries ?? []) {
    const r = canaryOutcome(await runOne(c));

    canaries.push(r);
    log(`  ${r.ok ? 'pass' : 'FAIL'}  canary: ${c.name}`);
  }

  const busy = checks.some((c) => c.busy);
  const voided = (!gate.canaries?.length && 'no canaries') || (busy && 'machine busy') || false;
  const ok = checks.every((c) => c.ok) && canaries.every((c) => c.ok);

  return { id: gate.id, title: gate.title, stage: gate.stage, state: gate.state, ok, voided, checks, canaries };
}

const IGNORED_CHANGES = Object.freeze(['verify/out', 'verify/status.json']);

export function parsePorcelain(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).split(' -> ').at(-1).replace(/^"|"$/g, ''))
    .filter((f) => !IGNORED_CHANGES.some((dir) => under(f, dir)))
    .sort();
}

export function uncommitted() {
  try {
    const text = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    return parsePorcelain(text);
  } catch {
    return ['(git status failed)'];
  }
}

const LISTED_CHANGES = 40;

export function treeRecord(changed) {
  const files = [...new Set(changed)].sort();

  return {
    tree: files.length ? 'dirty' : 'clean',
    uncommittedPinned: files.filter(isPinned).slice(0, LISTED_CHANGES),
    uncommitted: files.slice(0, LISTED_CHANGES),
    uncommittedCount: files.length,
  };
}

function headCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function saveResult(result, file = STATUS_FILE, changedBefore = []) {
  const status = readJson(file, { gates: {} });

  status.gates[result.id] = {
    ...result,
    commit: headCommit(),
    at: new Date().toISOString(),
    manifest: manifestDrift().length ? 'drifted' : 'clean',
    ...treeRecord([...changedBefore, ...uncommitted()]),
  };
  fs.writeFileSync(file, `${JSON.stringify(status, null, 2)}\n`);

  return status;
}

export function ratchetProblems(counts, floor) {
  return Object.entries(floor).flatMap(([gate, min]) =>
    (counts[gate] ?? 0) < min ? [`${gate}: ${counts[gate] ?? 0} checks, needs at least ${min}`] : [],
  );
}

export const readStatus = (file = STATUS_FILE) => readJson(file, { gates: {} });
