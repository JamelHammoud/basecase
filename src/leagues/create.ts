import { refuse } from '../cases/validate';
import type { LeagueEngine, LeagueEntry } from './types';
import { hashValue, LEAGUE_JSON_MAX, validateManifest, verifyManifest } from './validation';

export function createLeague(json: string, now: string, engine: LeagueEngine) {
  if (new TextEncoder().encode(json).byteLength > LEAGUE_JSON_MAX) return refuse('League manifest', 'is too large');

  const manifest = validateManifest(JSON.parse(json));

  verifyManifest(manifest);

  if (!Number.isFinite(Date.parse(now)) || Date.parse(manifest.deadline) <= Date.parse(now))
    return refuse('League deadline', 'has passed');

  if (hashValue(manifest.engine) !== hashValue(engine)) return refuse('League engine', 'does not match');

  return { manifest, entries: [] as LeagueEntry[] };
}
