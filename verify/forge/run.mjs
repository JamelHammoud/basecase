import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sh } from '../lib/gate.mjs';
import { jsonLines, trainerPython } from '../lib/python.mjs';

const FIXTURES = path.join(ROOT, 'verify', 'out', 'fixtures');

export const FORGE_MANIFEST = path.join(ROOT, 'forge', 'Cargo.toml');
export const FORGE_BIN = path.join(ROOT, 'forge', 'target', 'release', 'forge-train');

export function prepareJob(robot, name, over = {}) {
  const dir = path.join(ROOT, 'verify', 'out', 'forge', name);

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, robot, 'model.xml'), path.join(dir, 'model.xml'));

  const job = JSON.parse(fs.readFileSync(path.join(FIXTURES, robot, 'job.json'), 'utf8'));

  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ ...job, ...over }));

  return dir;
}

export function runForge(dir) {
  const r = sh(FORGE_BIN, ['--job', dir]);

  return { ...r, lines: jsonLines(r.stdout) };
}

export function runPython(dir) {
  const r = trainerPython('electron/trainer/train.py', ['--job', dir]);

  return { ...r, lines: jsonLines(r.stdout) };
}

export const stepsToGate = (lines) => {
  const hit = lines.filter((l) => l.type === 'gate').find((l) => l.passed >= Math.ceil(0.9 * l.seeds));

  return hit ? hit.steps : null;
};
