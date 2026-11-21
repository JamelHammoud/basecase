import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLeagueBoard, fetchLeagueEntry } from './boardLoader';
import type { FrozenStandings, LeagueBoard } from './types';
import type { BundleCheckJob } from './bundleCheck';
import { verifyEntryBundle } from './validation';

vi.mock('./bundleCheck', () => ({
  verifyLeagueBundle: async ({ manifest, entry, bytes }: BundleCheckJob) => verifyEntryBundle(manifest, entry, bytes),
}));

const directory = new URL('../../public/leagues/rover-sprint/', import.meta.url);
const board: LeagueBoard = JSON.parse(fs.readFileSync(new URL('board.json', directory), 'utf8'));
const frozen: FrozenStandings = JSON.parse(fs.readFileSync(new URL('results.json', directory), 'utf8'));
const source = '/leagues/rover-sprint/board.json';

function serve(replies: Record<string, unknown>) {
  const fetch = vi.fn(async (url: string) => {
    const reply = replies[url];

    return new Response(JSON.stringify(reply), { status: reply === undefined ? 404 : 200 });
  });

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('League browser evidence', () => {
  it('loads frozen seeded evidence and verifies the selected robot before opening the gallery', async () => {
    const entry = board.entries[0];
    const bundle = JSON.parse(fs.readFileSync(new URL(`${entry.id}.json`, directory), 'utf8'));

    serve({
      [source]: board,
      '/leagues/rover-sprint/results.json': frozen,
      [`/leagues/rover-sprint/${entry.id}.json`]: bundle,
    });

    const league = await fetchLeagueBoard(source);
    const loaded = await fetchLeagueEntry(league, entry);

    expect(league.frozen).toEqual(frozen);
    expect(loaded.bundle.robot.name).toBe(entry.robotName);
    expect(loaded.bundle.case).toEqual(board.manifest.case);
  });

  it('refuses forged results without displaying frozen standings', async () => {
    const forged = structuredClone(frozen);

    forged.standings[0].passes++;
    serve({ [source]: board, '/leagues/rover-sprint/results.json': forged });

    await expect(fetchLeagueBoard(source)).rejects.toThrow('does not match');
  });

  it('never trusts a remote publisher’s self-declared frozen hash', async () => {
    const remote = `https://huggingface.co/datasets/outsider/league/resolve/${'a'.repeat(40)}/board.json`;
    const fetch = serve({ [remote]: board });

    await expect(fetchLeagueBoard(remote)).rejects.toThrow('publisher');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('pins the accepted entry revision even when the board lives at another Hub revision', async () => {
    const remote = `https://huggingface.co/datasets/JamelHammoud/basecase-leagues/resolve/${'a'.repeat(40)}/board.json`;
    const entry = board.entries[0];
    const bundle = JSON.parse(fs.readFileSync(new URL(`${entry.id}.json`, directory), 'utf8'));
    const entryUrl = `https://huggingface.co/datasets/${entry.repo}/resolve/${entry.revision}/basecase-robot.json`;
    const fetch = serve({
      [remote]: board,
      [remote.replace('board.json', 'results.json')]: frozen,
      [entryUrl]: bundle,
    });

    await fetchLeagueEntry(await fetchLeagueBoard(remote), entry);
    expect(fetch).toHaveBeenLastCalledWith(entryUrl, { credentials: 'omit' });
    expect(fetch.mock.calls.some(([url]) => url.includes('/main/'))).toBe(false);
  });

  it('rejects external origins, duplicate identities and oversized metadata before loading robots', async () => {
    const fetch = serve({ [source]: { ...board, entries: [board.entries[0], board.entries[0]] } });

    await expect(fetchLeagueBoard('https://example.com/board.json')).rejects.toThrow('League link');
    expect(fetch).not.toHaveBeenCalled();
    await expect(fetchLeagueBoard(source)).rejects.toThrow('repeats an entry');
    vi.stubGlobal('fetch', async () => new Response('{}', { headers: { 'content-length': String(3 * 1024 * 1024) } }));
    await expect(fetchLeagueBoard(source)).rejects.toThrow('Too large');
  });
});
