import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TryStore } from '../../electron/library/tryStore.mjs';

const COUNT = 5000;
const BUDGET_MS = 200;
const ROBOTS = ['SO-101 Arm', 'Rover', 'Hexapod', 'G1'];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tries-bench-'));
const open = () =>
  new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, '.try-summaries.json') });

const manifest = (i) => ({
  version: 1,
  id: `try-${i}`,
  sceneId: `scene-${i % 40}`,
  robot: { name: ROBOTS[i % 4], modelHash: 'm'.repeat(64), joints: Array.from({ length: 12 }, (_, j) => `joint_${j}`) },
  case: { id: 'touch-the-dots', name: 'Touch the Dots', hash: 'c'.repeat(64) },
  source: i % 3 ? 'case' : 'generated',
  input: null,
  startedAt: new Date(1e12 + i * 1000).toISOString(),
  seconds: 8,
  rate: 50,
  frames: 400,
  outcome: { verdict: 'passed', margin: 0.1 },
  seed: i % 50,
  sourceTry: null,
  faults: [],
});

function timed(run) {
  const started = performance.now();
  const out = run();

  return { out, ms: performance.now() - started };
}

try {
  const writer = open();

  for (let i = 0; i < COUNT; i++) writer.save({ manifest: manifest(i), recording: new Uint8Array(64) });

  const cold = timed(() => open().list());
  const warm = [1, 2, 3].map(() => timed(() => open().list()).ms);
  const payload = JSON.stringify(cold.out);
  const parse = timed(() => JSON.parse(payload)).ms;
  const best = Math.min(...warm);

  console.log(
    `${COUNT} tries: first list ${cold.ms.toFixed(0)} ms, cached ${warm.map((ms) => ms.toFixed(0)).join(' / ')} ms`,
  );
  console.log(`list ${(payload.length / 1024).toFixed(0)} KB, parsed in ${parse.toFixed(1)} ms`);

  if (best > BUDGET_MS) {
    console.error(`Over the ${BUDGET_MS} ms budget`);
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
