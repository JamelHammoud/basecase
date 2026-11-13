import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = '/src/forge/walkReplay.ts';
const DEFAULT_SEEDS = 32;
const DEFAULT_SPEED = 0.2;

async function loadReplay() {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });

  try {
    return (await server.ssrLoadModule(ENTRY)).replayWalk;
  } finally {
    await server.close();
  }
}

const readJson = (folder, name) => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));

async function main() {
  const [folder, seeds] = process.argv.slice(2);

  if (!folder) throw new Error('Usage: node tools/forge/wasm-replay.mjs <job folder> [seeds]');

  const job = readJson(folder, 'job.json');
  const replayWalk = await loadReplay();
  const mj = await loadMujoco();
  const result = replayWalk(mj, {
    xml: fs.readFileSync(path.join(folder, 'model.xml'), 'utf8'),
    job: {
      root: job.root,
      initialJoints: job.initialJoints ?? {},
      rootOffset: job.rootOffset ?? [0, 0, 0],
      ctrlDefault: job.ctrlDefault,
      joints: job.joints,
      gateSpeed: job.gateSpeed ?? DEFAULT_SPEED,
      seed: job.seed ?? 0,
      resetNoise: job.resetNoise,
    },
    policy: readJson(folder, 'policy.json'),
    seeds: Number(seeds ?? DEFAULT_SEEDS),
  });

  console.log(JSON.stringify({ mujoco: mj.mj_versionString?.() ?? null, ...result }));
}

await main();
