import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, VERIFY_DIR } from './gate.mjs';

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

export function currentManifest() {
  return Object.fromEntries(gateFiles().map((f) => [f, hashFile(path.join(GATES_DIR, f))]));
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

export function canaryOutcome(result) {
  return {
    ...result,
    ok: !result.ok,
    detail: result.ok ? 'Canary did not fire: the check passed a planted fault' : '',
  };
}

export async function runGate(gate, log = () => {}) {
  const checks = [];
  const canaries = [];

  for (const c of gate.checks) {
    const r = await runOne(c);

    checks.push(r);
    log(`  ${r.ok ? 'pass' : 'FAIL'}  ${c.name}${r.detail ? ` (${r.detail.split('\n')[0]})` : ''}`);
  }

  for (const c of gate.canaries ?? []) {
    const r = canaryOutcome(await runOne(c));

    canaries.push(r);
    log(`  ${r.ok ? 'pass' : 'FAIL'}  canary: ${c.name}`);
  }

  const voided = !gate.canaries?.length;
  const ok = checks.every((c) => c.ok) && canaries.every((c) => c.ok);

  return { id: gate.id, title: gate.title, stage: gate.stage, state: gate.state, ok, voided, checks, canaries };
}

function headCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function saveResult(result, file = STATUS_FILE) {
  const status = readJson(file, { gates: {} });

  status.gates[result.id] = {
    ...result,
    commit: headCommit(),
    at: new Date().toISOString(),
    manifest: manifestDrift().length ? 'drifted' : 'clean',
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
