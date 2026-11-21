import fs from 'node:fs/promises';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { ROOT, leagueModule } from './runtime.mjs';

const input = JSON.parse(await fs.readFile(process.argv[2], 'utf-8'));
const bytes = new Uint8Array(await fs.readFile(process.argv[3]));

if (process.env.HF_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
  throw new Error('Replay refuses credentials.');

globalThis.fetch = async () => {
  throw new Error('Replay cannot fetch.');
};

const { replayLeagueSeed } = await leagueModule('replay');
const { verifyEntryBundle } = await leagueModule('validation');
const bundle = verifyEntryBundle(input.manifest, input.entry, bytes);
const meshes = {};

for (const part of bundle.robot.parts) {
  if (part.kind !== 'component' || !/^[a-z0-9-]{1,96}$/.test(part.componentId ?? '')) continue;

  const file = await fs.readFile(path.join(ROOT, 'public/parts', `${part.componentId}.glb`));

  meshes[part.componentId] = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

const mj = await loadMujoco();
const results = [];

for (const seed of input.seeds)
  results.push(
    await replayLeagueSeed(mj, input.manifest, input.entry, { bytes, seed, meshes }).then(({ outcome, budget }) => ({
      outcome,
      budget,
    })),
  );

await fs.writeFile(process.argv[4], JSON.stringify(results));
