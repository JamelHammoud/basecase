import type { Case } from '../cases/schema';

export interface LeagueEngine {
  mujoco: string;
  runner: string;
}

export interface LeagueManifest {
  formatVersion: 1;
  id: string;
  title: string;
  deadline: string;
  case: Case;
  caseHash: string;
  contractHash: string;
  engine: LeagueEngine;
  ranking: { score: 'margin' | 'score'; direction: 'higher' | 'lower' };
  seedCount: number;
}

export interface LeagueEntry {
  robotName?: string;
  id: string;
  repo: string;
  revision: string;
  bundleHash: string;
  enteredAt: string;
  budget: number | null;
}

export interface LeagueOutcome {
  seed: number;
  passed: boolean;
  margin: number;
  score: number;
  failed: string[];
}

export interface LeagueStanding {
  entryId: string;
  bundleHash: string;
  passes: number;
  score: number;
  budget: number | null;
  outcomes: LeagueOutcome[];
}

export interface LeagueClosure {
  formatVersion: 1;
  manifestHash: string;
  closedAt: string;
  entries: LeagueEntry[];
  entropy: string;
}

export interface FrozenStandings {
  formatVersion: 1;
  manifestHash: string;
  closureHash: string;
  seeds: number[];
  seedHash: string;
  engine: LeagueEngine;
  provenance: { repository: string; commit: string; runId: string };
  standings: LeagueStanding[];
}

export interface LeagueBoard {
  manifest: LeagueManifest;
  entries: LeagueEntry[];
  closure: LeagueClosure;
  frozenHash: string;
}
