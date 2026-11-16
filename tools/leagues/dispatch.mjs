import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, leagueModule } from './runtime.mjs';
import { currentIssuerBoard, pinnedBytes, pinnedJson, pinnedRef } from './hub.mjs';

const { validateManifest, validateEntry, verifyEntryBundle, hashValue } = await leagueModule('validation');
const { closeLeague, closureSeeds, adjudicate } = await leagueModule('adjudication');
const { parseLeagueSubmission, LEAGUE_ENTRY_FILE } = await leagueModule('entrySources');
const operation = process.argv[2];
const output = path.resolve(process.argv[3] ?? 'scratch/league-output');
const now = new Date().toISOString();

await fs.mkdir(output, { recursive: true });

async function admit(board) {
  const manifest = validateManifest(board.manifest);
  const submission = parseLeagueSubmission(
    await pinnedJson(pinnedRef(process.env.LEAGUE_SUBMISSION), LEAGUE_ENTRY_FILE),
  );

  if (board.frozenHash || Date.parse(now) >= Date.parse(manifest.deadline)) throw new Error('The League is closed.');

  if (submission.league !== manifest.id || submission.manifestHash !== hashValue(manifest))
    throw new Error('League manifest does not match.');

  const entry = validateEntry({ ...submission.entry, enteredAt: now, budget: null });
  const bytes = await pinnedBytes(
    { repo: entry.repo, revision: entry.revision },
    'basecase-robot.json',
    8 * 1024 * 1024,
  );

  verifyEntryBundle(manifest, entry, bytes);

  const entries = (board.entries ?? []).map(validateEntry);

  if (entries.some((existing) => existing.id === entry.id)) return { manifest, entries };

  if (entries.length >= 100) throw new Error('The League is full.');

  return { manifest, entries: [...entries, entry] };
}

async function replayEntry(entry, state) {
  const { manifest, seeds } = state;
  const folder = path.join(output, entry.id);

  await fs.mkdir(folder, { recursive: true });

  const bytes =
    operation === 'fixture' || process.env.LEAGUE_FIXTURE === 'true'
      ? await fs.readFile(path.join(ROOT, 'public/leagues/rover-sprint', `${entry.id}.json`))
      : await pinnedBytes({ repo: entry.repo, revision: entry.revision }, 'basecase-robot.json', 8 * 1024 * 1024);

  verifyEntryBundle(manifest, entry, bytes);
  await fs.writeFile(path.join(folder, 'bundle.json'), bytes);
  await fs.writeFile(path.join(folder, 'input.json'), JSON.stringify({ manifest, entry, seeds }));

  const child = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=512',
      fileURLToPath(new URL('./replayWorker.mjs', import.meta.url)),
      path.join(folder, 'input.json'),
      path.join(folder, 'bundle.json'),
      path.join(folder, 'results.json'),
    ],
    {
      cwd: ROOT,
      timeout: 180000,
      maxBuffer: 1024 * 1024,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
      },
    },
  );

  if (child.error || child.status !== 0)
    throw new Error(`League replay stopped: ${child.error?.message ?? child.stderr.toString().slice(-2000)}`);

  return JSON.parse(await fs.readFile(path.join(folder, 'results.json'), 'utf-8'));
}

async function verifyFixture(frozen) {
  if (process.env.LEAGUE_FIXTURE !== 'true') return;

  const fixture = JSON.parse(await fs.readFile(path.join(ROOT, 'public/leagues/rover-sprint/results.json'), 'utf-8'));

  if (hashValue(fixture.standings) !== hashValue(frozen.standings)) throw new Error('Fixture replay changed.');
}

async function freeze(board) {
  const manifest = validateManifest(board.manifest);
  const closurePath = path.join(output, 'closure.json');
  let closure = board.closure;

  try {
    closure ??= JSON.parse(await fs.readFile(closurePath, 'utf-8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;

    closure = closeLeague({
      manifest,
      entries: board.entries.map(validateEntry),
      now,
      entropy: crypto.randomBytes(32).toString('hex'),
    });
    await fs.writeFile(closurePath, JSON.stringify(closure));
  }

  const seeds = closureSeeds(manifest, closure);

  if (operation === 'close') return { manifest, entries: closure.entries, closure };

  await fs.writeFile(closurePath, JSON.stringify(closure));

  const cache = new Map();

  for (const entry of closure.entries) cache.set(entry.id, await replayEntry(entry, { manifest, seeds }));

  const provenance = {
    repository: process.env.GITHUB_REPOSITORY ?? 'JamelHammoud/basecase',
    commit: process.env.GITHUB_SHA ?? '0'.repeat(40),
    runId: process.env.GITHUB_RUN_ID ?? 'fixture',
  };
  const frozen = await adjudicate({
    manifest,
    closure,
    provenance,
    replay: async (entry, seed) => cache.get(entry.id).find((result) => result.outcome.seed === seed),
  });

  await verifyFixture(frozen);

  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(frozen));

  return { manifest, entries: closure.entries, closure, frozenHash: hashValue(frozen) };
}

async function sourceBoard() {
  if (operation === 'replay') return JSON.parse(await fs.readFile(path.join(output, 'board.json'), 'utf-8'));

  if (operation === 'fixture')
    return JSON.parse(await fs.readFile(path.join(ROOT, 'public/leagues/rover-sprint/board.json'), 'utf-8'));

  const current = await currentIssuerBoard(process.env.LEAGUE_SOURCE);

  await fs.writeFile(path.join(output, 'source.json'), JSON.stringify({ revision: current.revision }));

  return current.board;
}

const board = await sourceBoard();
const next = operation === 'admit' ? await admit(board) : await freeze(board);

await fs.writeFile(path.join(output, 'board.json'), JSON.stringify(next));
