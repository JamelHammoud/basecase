import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { ROOT, leagueModule } from './runtime.mjs';

const output = path.resolve(process.argv[2]);

async function create() {
  const { createLeague } = await leagueModule('create');
  const { LEAGUE_RUNNER_VERSION } = await leagueModule('validation');
  const mj = await loadMujoco();
  const board = createLeague(process.env.LEAGUE_MANIFEST ?? '', new Date().toISOString(), {
    mujoco: mj.mj_versionString(),
    runner: LEAGUE_RUNNER_VERSION,
    commit: process.env.GITHUB_SHA,
  });

  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'board.json'), JSON.stringify(board));
  await fs.writeFile(path.join(output, 'source.json'), JSON.stringify({ revision: null }));
}

async function prepare() {
  if (process.env.OPERATION === 'create') return create();

  if (process.env.OPERATION === 'fixture') {
    await fs.mkdir(output, { recursive: true });
    await fs.copyFile(path.join(ROOT, 'public/leagues/rover-sprint/board.json'), path.join(output, 'board.json'));

    return;
  }

  const operation = process.env.OPERATION === 'admit' ? 'admit' : 'close';
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./dispatch.mjs', import.meta.url)), operation, output],
    { env: process.env, stdio: 'inherit' },
  );

  if (child.status !== 0) process.exit(1);
}

await prepare();

const board = JSON.parse(await fs.readFile(path.join(output, 'board.json'), 'utf-8'));
const runner = process.env.OPERATION === 'fixture' ? process.env.GITHUB_SHA : board.manifest.engine.commit;

if (!/^[a-f0-9]{40}$/.test(runner ?? '')) throw new Error('The League needs a pinned runner commit.');

if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `runner=${runner}\n`);
