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

export const GPU_LINE = 'Training on the GPU: physics, policy and learner on ';
export const CPU_FALLBACK = '. Learning on the CPU';

export function gpuProblems(lines) {
  const messages = lines.filter((l) => l.type === 'status').map((l) => String(l.message ?? ''));
  const fellBack = messages.find((m) => m.endsWith(CPU_FALLBACK));

  if (fellBack) return [`fell back to the CPU: ${fellBack}`];

  return messages.some((m) => m.startsWith(GPU_LINE)) ? [] : ['never reported training on the GPU loop'];
}

const REPLAY_MARK = 'C MuJoCo replay of the folder: ';
const REPLAY_SEEDS = 32;

export function replayInC(dir) {
  const r = sh(
    'cargo',
    [
      'test',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-train',
      '--test',
      'acceptance_replay',
      '--',
      'replay_folder_in_c',
      '--exact',
      '--nocapture',
    ],
    { env: { ...process.env, FORGE_REPLAY_FOLDER: dir } },
  );
  const line = r.stdout.split('\n').find((l) => l.startsWith(REPLAY_MARK));

  if (!r.ok || !line) return { reached: false, why: `replay did not run: ${r.stderr.trim().split('\n').at(-1)}` };

  const result = JSON.parse(line.slice(REPLAY_MARK.length));
  const reached = result.seeds === REPLAY_SEEDS && result.passed >= Math.ceil(0.9 * result.seeds);

  return { reached, why: reached ? '' : `replay passed ${result.passed} of ${result.seeds} seeds`, result };
}

export const stepsToGate = (lines) => {
  const hit = lines.filter((l) => l.type === 'gate').find((l) => l.passed >= Math.ceil(0.9 * l.seeds));

  return hit ? hit.steps : null;
};
