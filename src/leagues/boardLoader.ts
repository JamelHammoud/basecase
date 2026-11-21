import { asRecord, asString } from '../cases/validate';
import { restoreWorldAssets, sceneWorldAssets } from '../cases/worldAssets';
import { cappedBytes } from '../gallery/fetchBundle';
import { GALLERY_BUNDLE_MAX_BYTES, type GalleryBundle } from '../gallery/galleryBundle';
import { HUB_ORIGIN, SHARED_ROBOT_FILE } from '../gallery/galleryLinks';
import { verifyLeagueBundle } from './bundleCheck';
import { closeLeague, verifyFrozen } from './adjudication';
import { allowedLeagueSource, shippedLeagueSource, trustedLeagueSource } from './boardSource';
import type { FrozenStandings, LeagueEntry, LeagueManifest } from './types';
import { hashValue, validateEntry, validateManifest, verifyManifest } from './validation';

export interface LoadedLeague {
  manifest: LeagueManifest;
  entries: LeagueEntry[];
  frozen: FrozenStandings | null;
  source: string;
}

const BOARD_LIMIT = 2 * 1024 * 1024;

async function fetchBytes(url: string, max: number): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'omit' });

  if (!response.ok) throw new Error('Couldn’t load the League. Open its link again.');

  return cappedBytes(response, max);
}

const json = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));

function readClosure(value: unknown, manifest: LeagueManifest) {
  const raw = asRecord(value, 'League closure');

  if (!Array.isArray(raw.entries) || raw.entries.length > 100) throw new Error('The League has too many entries.');

  const closure = closeLeague({
    manifest,
    entries: raw.entries.map(validateEntry),
    now: asString(raw.closedAt, 'League closure time'),
    entropy: asString(raw.entropy, 'League closure entropy'),
  });

  if (hashValue(closure) !== hashValue(raw)) throw new Error('The League closure does not match.');

  return closure;
}

export async function fetchLeagueBoard(source: string): Promise<LoadedLeague> {
  if (!allowedLeagueSource(source)) throw new Error('Open a League link.');

  const board = asRecord(json(await fetchBytes(source, BOARD_LIMIT)), 'League board');
  const manifest = validateManifest(board.manifest);

  verifyManifest(manifest);

  const rawEntries = board.entries ?? [];

  if (!Array.isArray(rawEntries) || rawEntries.length > 100) throw new Error('The League has too many entries.');

  const entries = rawEntries.map(validateEntry);

  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new Error('The League repeats an entry.');

  if (!board.frozenHash) return { manifest, entries, frozen: null, source };

  if (!trustedLeagueSource(source)) throw new Error('Frozen standings need the League publisher’s link.');

  const frozen = json(await fetchBytes(source.replace(/board\.json$/, 'results.json'), BOARD_LIMIT)) as FrozenStandings;

  verifyFrozen(manifest, entries, frozen, {
    expectedHash: asString(board.frozenHash, 'League evidence hash'),
    closure: readClosure(board.closure, manifest),
  });

  return { manifest, entries, frozen, source };
}

export function entryBundleSource(source: string, entry: LeagueEntry): string {
  validateEntry(entry);

  if (!allowedLeagueSource(source)) throw new Error('Open a League link.');

  if (shippedLeagueSource(source)) return source.replace(/board\.json$/, `${entry.id}.json`);

  return `${HUB_ORIGIN}/datasets/${entry.repo}/resolve/${entry.revision}/${SHARED_ROBOT_FILE}`;
}

export async function fetchLeagueEntry(league: LoadedLeague, entry: LeagueEntry) {
  const bytes = await fetchBytes(entryBundleSource(league.source, entry), GALLERY_BUNDLE_MAX_BYTES);
  const bundle: GalleryBundle = await verifyLeagueBundle({ manifest: league.manifest, entry, bytes });
  const assets = await restoreWorldAssets(bundle.worldAssets);

  sceneWorldAssets({ cases: [bundle.case] }, assets);

  return { bundle, bytes };
}
