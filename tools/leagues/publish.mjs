import fs from 'node:fs/promises';
import path from 'node:path';
import { HubClient } from '../../electron/hub/hubClient.mjs';
import { publishRepo } from '../../electron/hub/publishRepo.mjs';
import { ISSUER, pinnedRef, pinnedJson, client } from './hub.mjs';
import { leagueModule } from './runtime.mjs';

const { hashValue, validateManifest, validateEntry } = await leagueModule('validation');
const { closureSeeds, verifyFrozen } = await leagueModule('adjudication');
const folder = path.resolve(process.argv[2]);
const boardBytes = await fs.readFile(path.join(folder, 'board.json'));
const board = JSON.parse(boardBytes.toString('utf-8'));
const manifest = validateManifest(board.manifest);
const creating = process.env.OPERATION === 'create';
const ref = creating ? { repo: ISSUER } : pinnedRef(process.env.LEAGUE_SOURCE);

if (ref.repo !== ISSUER || process.env.GITHUB_REPOSITORY !== 'JamelHammoud/basecase')
  throw new Error('Unsupported League publisher.');

const response = await client().api(`/api/datasets/${ISSUER}/revision/main`, { allow: [404] });
const info = response.status === 404 ? null : await response.json();
const current = info ? await pinnedJson({ repo: ISSUER, revision: info.sha }, 'board.json') : null;

async function publishCreation() {
  const { createLeague } = await leagueModule('create');
  const { LEAGUE_RUNNER_VERSION } = await leagueModule('validation');
  const { default: loadMujoco } = await import('@mujoco/mujoco');
  const mj = await loadMujoco();

  createLeague(JSON.stringify(manifest), new Date().toISOString(), {
    mujoco: mj.mj_versionString(),
    runner: LEAGUE_RUNNER_VERSION,
  });

  if (current && (!current.frozenHash || current.manifest.id === manifest.id))
    throw new Error('Finish the current League and use a new identity.');

  if (board.entries.length || board.closure || board.frozenHash)
    throw new Error('A new League starts without entries or results.');

  const [namespace, name] = ISSUER.split('/');

  console.log(
    JSON.stringify(
      await publishRepo(new HubClient({ token: process.env.HF_TOKEN }), {
        namespace,
        name,
        files: { 'board.json': new Uint8Array(boardBytes) },
        includeRevision: true,
      }),
    ),
  );
}

if (creating) {
  await publishCreation();
  process.exit(0);
}

if (!current) throw new Error('Create the League first.');

const preparedSource = JSON.parse(await fs.readFile(path.join(folder, 'source.json'), 'utf-8'));

if (hashValue(current.manifest) !== hashValue(manifest)) throw new Error('The League has changed or is frozen.');

if (!board.frozenHash && !current.closure && info.sha !== preparedSource.revision)
  throw new Error('The League source moved. Dispatch its current commit.');

if (current.closure && hashValue(current.closure) !== hashValue(board.closure))
  throw new Error('The League closure cannot change.');

async function alreadyFrozen() {
  if (!current.frozenHash) return false;

  if (!board.frozenHash) return true;

  const existing = await pinnedJson({ repo: ISSUER, revision: info.sha }, 'results.json');
  const replayed = JSON.parse(await fs.readFile(path.join(folder, 'results.json'), 'utf-8'));
  const measurements = (result) => ({
    closureHash: result.closureHash,
    seedHash: result.seedHash,
    engine: result.engine,
    standings: result.standings,
  });

  if (hashValue(measurements(existing)) !== hashValue(measurements(replayed)))
    throw new Error('Frozen League measurements cannot change.');

  return true;
}

if (await alreadyFrozen()) process.exit(0);

const entries = board.entries.map(validateEntry);
const files = { 'board.json': new Uint8Array(boardBytes) };

if (board.closure) closureSeeds(manifest, board.closure);

async function resultFile() {
  const bytes = await fs.readFile(path.join(folder, 'results.json'));
  const frozen = JSON.parse(bytes.toString('utf-8'));

  if (!current.closure) throw new Error('Publish the League closure before replay.');

  verifyFrozen(manifest, entries, frozen, { expectedHash: board.frozenHash, closure: board.closure });

  if (
    frozen.provenance.repository !== process.env.GITHUB_REPOSITORY ||
    frozen.provenance.commit !== process.env.GITHUB_SHA ||
    frozen.provenance.runId !== process.env.GITHUB_RUN_ID
  )
    throw new Error('League replay provenance does not match this run.');

  return new Uint8Array(bytes);
}

if (board.frozenHash) files['results.json'] = await resultFile();

if (current.frozenHash && current.frozenHash !== board.frozenHash) throw new Error('The League is frozen.');

if (hashValue(current) === hashValue(board)) process.exit(0);

const [namespace, name] = ISSUER.split('/');
const published = await publishRepo(new HubClient({ token: process.env.HF_TOKEN }), {
  namespace,
  name,
  files,
  includeRevision: true,
});

console.log(JSON.stringify(published));
