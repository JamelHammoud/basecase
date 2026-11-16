import { asId, asRecord, asString, refuse } from '../cases/validate';
import { validateEntry } from './validation';
import type { LeagueEntry } from './types';

export const LEAGUE_ENTRY_FILE = 'league-entry.json';

export interface LeagueSubmission {
  league: string;
  manifestHash: string;
  entry: LeagueEntry;
}

export function parseLeagueSubmission(input: unknown): LeagueSubmission {
  const value = asRecord(input, 'League entry');
  const manifestHash = asString(value.manifestHash, 'League manifest hash');

  if (!/^[a-f0-9]{64}$/.test(manifestHash)) return refuse('League manifest hash', 'needs a content hash');

  return {
    league: asId(value.league, 'League'),
    manifestHash,
    entry: validateEntry(value.entry),
  };
}
