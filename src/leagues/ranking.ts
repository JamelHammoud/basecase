import { refuse } from '../cases/validate';
import type { LeagueEntry, LeagueManifest, LeagueOutcome, LeagueStanding } from './types';

export function standingOf(entry: LeagueEntry, outcomes: LeagueOutcome[], budget: number | null): LeagueStanding {
  if (
    !outcomes.length ||
    outcomes.some(
      (outcome) =>
        !Number.isFinite(outcome.score) ||
        !Number.isFinite(outcome.margin) ||
        typeof outcome.passed !== 'boolean' ||
        !Number.isSafeInteger(outcome.seed) ||
        outcome.seed < 0 ||
        outcome.seed > 0xffffffff ||
        !Array.isArray(outcome.failed) ||
        outcome.failed.length > 16 ||
        outcome.failed.some((line) => typeof line !== 'string' || line.length > 2000),
    )
  )
    return refuse('League result', 'has missing measurements');

  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return refuse('League Budget', 'has no measurement');

  const score = outcomes.reduce((sum, outcome) => sum + outcome.score, 0) / outcomes.length;

  if (!Number.isFinite(score)) return refuse('League score', 'has no measurement');

  return {
    entryId: entry.id,
    bundleHash: entry.bundleHash,
    passes: outcomes.filter((outcome) => outcome.passed).length,
    score,
    budget,
    outcomes,
  };
}

const identityOrder = (a: string, b: string) => (a < b ? -1 : Number(a > b));
const budgetOrder = (a: number | null, b: number | null) => {
  if (a === null) return Number(b !== null);

  return b === null ? -1 : a - b;
};

export function rankStandings(manifest: LeagueManifest, rows: LeagueStanding[]): LeagueStanding[] {
  const sign = manifest.ranking.direction === 'higher' ? -1 : 1;

  return [...rows].sort(
    (a, b) =>
      b.passes - a.passes ||
      sign * (a.score - b.score) ||
      budgetOrder(a.budget, b.budget) ||
      identityOrder(a.entryId, b.entryId),
  );
}
