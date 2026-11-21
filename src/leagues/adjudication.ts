import { refuse } from '../cases/validate';
import { rankStandings, standingOf } from './ranking';
import { hashValue, LEAGUE_ENTRIES_MAX, validateEntry, validateManifest, verifyManifest } from './validation';
import type { FrozenStandings, LeagueClosure, LeagueEntry, LeagueManifest, LeagueOutcome } from './types';

interface CloseOptions {
  manifest: LeagueManifest;
  entries: LeagueEntry[];
  now: string;
  entropy: string;
}

export function closeLeague({ manifest, entries, now, entropy }: CloseOptions): LeagueClosure {
  verifyManifest(validateManifest(manifest));

  if (!Number.isFinite(Date.parse(now)) || Date.parse(now) <= Date.parse(manifest.deadline))
    return refuse('League deadline', 'has not passed');

  if (!/^[0-9a-f]{64}$/.test(entropy) || entries.length > LEAGUE_ENTRIES_MAX)
    return refuse('League closure', 'has unsupported values');

  const accepted = entries
    .map(validateEntry)
    .filter((entry) => Date.parse(entry.enteredAt) <= Date.parse(manifest.deadline));

  if (new Set(accepted.map((entry) => entry.id)).size !== accepted.length)
    return refuse('League entry', 'repeats an identity');

  return {
    formatVersion: 1,
    manifestHash: hashValue(manifest),
    closedAt: now,
    entries: accepted.sort((a, b) => (a.id < b.id ? -1 : Number(a.id > b.id))),
    entropy,
  };
}

export function closureSeeds(manifest: LeagueManifest, closure: LeagueClosure): number[] {
  const checked = closeLeague({ manifest, entries: closure.entries, now: closure.closedAt, entropy: closure.entropy });

  if (hashValue(checked) !== hashValue(closure)) return refuse('League closure', 'does not match');

  return Array.from({ length: manifest.seedCount }, (_, index) =>
    Number.parseInt(hashValue({ closure: hashValue(closure), index }).slice(0, 8), 16),
  );
}

interface AdjudicateOptions {
  manifest: LeagueManifest;
  closure: LeagueClosure;
  provenance: FrozenStandings['provenance'];
  replay: (entry: LeagueEntry, seed: number) => Promise<{ outcome: LeagueOutcome; budget: number | null }>;
}

export async function adjudicate({
  manifest,
  closure,
  provenance,
  replay,
}: AdjudicateOptions): Promise<FrozenStandings> {
  const seeds = closureSeeds(manifest, closure);
  const standings = [];

  for (const entry of closure.entries) {
    const outcomes: LeagueOutcome[] = [];
    const budgets: Array<number | null> = [];

    for (const seed of seeds) {
      const result = await replay(entry, seed);

      if (result.outcome.seed !== seed) return refuse('League seed', 'does not match');

      outcomes.push(result.outcome);
      budgets.push(result.budget);
    }

    if (new Set(budgets).size !== 1) return refuse('League Budget', 'changed during replay');

    standings.push(standingOf(entry, outcomes, budgets[0]));
  }

  return {
    formatVersion: 1,
    manifestHash: hashValue(manifest),
    closureHash: hashValue(closure),
    seeds,
    seedHash: hashValue(seeds),
    engine: manifest.engine,
    provenance,
    standings: rankStandings(manifest, standings),
  };
}

export function verifyFrozen(
  manifest: LeagueManifest,
  entries: LeagueEntry[],
  frozen: FrozenStandings,
  { expectedHash, closure }: { expectedHash: string; closure: LeagueClosure },
): void {
  const seeds = closureSeeds(manifest, closure);

  if (
    hashValue(frozen) !== expectedHash ||
    frozen.formatVersion !== 1 ||
    frozen.manifestHash !== hashValue(manifest) ||
    frozen.closureHash !== hashValue(closure) ||
    hashValue(frozen.engine) !== hashValue(manifest.engine) ||
    (manifest.engine.commit !== undefined && frozen.provenance.commit !== manifest.engine.commit) ||
    frozen.seedHash !== hashValue(seeds) ||
    hashValue(frozen.seeds) !== hashValue(seeds) ||
    hashValue(entries) !== hashValue(closure.entries)
  )
    return refuse('League evidence', 'does not match');

  if (
    frozen.standings.length !== entries.length ||
    new Set(frozen.standings.map((row) => row.entryId)).size !== entries.length
  )
    return refuse('League evidence', 'is incomplete');

  const recomputed = entries.map((entry) => {
    const row = frozen.standings.find((standing) => standing.entryId === entry.id);

    if (
      !row ||
      row.bundleHash !== entry.bundleHash ||
      hashValue(row.outcomes.map((outcome) => outcome.seed)) !== hashValue(seeds)
    )
      return refuse('League evidence', 'is incomplete');

    return standingOf(entry, row.outcomes, row.budget);
  });

  if (hashValue(rankStandings(manifest, recomputed)) !== hashValue(frozen.standings))
    refuse('League evidence', 'has changed standings');
}
