import type { CaseRuns } from '../cases/caseRuns';
import type { Case } from '../cases/schema';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import type { Skill } from './artifacts';
import type { ForgeJob, ForgeRunner, SkillSave } from './forgeRunner';
import type { SkillRunner } from './skillsClient';
import type { SkillRecord } from './skillRecords';
import type { SkillJob, SkillRefusal, SkillTarget } from './skillRows';
import type { SnapshotRef, Snapshots } from './snapshots';
import type { ForgeProgress } from './trainerForge';
import type { TrainedEntry } from './kitEnvironment';
import type { KitWarm } from './motorKit';

export interface ForgeFactoryOptions {
  background: boolean;
  onProgress: (p: ForgeProgress) => void;
  onSnapshot?: (ref: SnapshotRef) => void;
  signal: AbortSignal;
}

export type ForgeFactory = (options: ForgeFactoryOptions) => ForgeRunner;

export interface RuntimeDeps {
  runner: SkillRunner;
  forge: ForgeFactory;
  save: SkillSave;
  loadSkill: (hash: string) => Promise<Skill | null>;
  onRecord: (record: SkillRecord) => void;
  onChange: (jobs: SkillJob[]) => void;
  onRefused?: (target: SkillTarget, refusal: SkillRefusal | null) => void;
  snapshots?: Snapshots;
}

export interface KitInstall {
  entry: TrainedEntry;
  warm: KitWarm;
}

export interface RaceReport {
  name: string;
  found: boolean;
  lines: string[];
  relaxation: string | null;
}

export interface TriesPlan {
  model: SimModel;
  kase: Case;
  job: ForgeJob;
  judge: (policy: PolicySpec) => Promise<TriesVerdict>;
  done: (outcome: TriesOutcome) => void;
}

export interface TriesVerdict {
  runs: CaseRuns;
  robotModel: string;
}

export interface TriesOutcome {
  runs: CaseRuns | null;
  kept: boolean;
  problem: string | null;
}
