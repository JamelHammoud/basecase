import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from './artifacts';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import type { KitWarm } from './motorKit';
import type { InstallCompleted } from './installRun';
import type { SkillRunner } from './skillsClient';
import type { SkillRecord } from './skillRecords';
import type { SkillJob, SkillRefusal, SkillTarget } from './skillRows';
import type { StressReport } from './skillsStress';
import type { SnapshotRef, Snapshots } from './snapshots';
import type { ForgeProgress } from './trainerForge';
import type { RecoveryEntry, SkillRecovery } from './skillRecovery';
import type { KitContext } from './kitTransitions';
import type { LocalKitPreparation } from './localKitSource';

export interface ForgeFactoryOptions {
  background: boolean;
  recoveryKey?: string;
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
  onStress?: (target: SkillTarget, report: StressReport | null) => void;
  snapshots?: Snapshots;
  kitContext?: (model: SimModel) => Promise<KitContext>;
  kitSources?: () => readonly SkillRecord[];
  prepareKitWarm?: (input: LocalKitPreparation) => Promise<KitWarm | undefined>;
  recovery?: SkillRecovery;
}

export interface KitInstall {
  onOutcome?: InstallCompleted;
  entry: TrainedEntry;
  warm: KitWarm;
}

export interface RaceReport {
  name: string;
  found: boolean;
  lines: string[];
  relaxation: string | null;
}

export interface Run {
  target: SkillTarget;
  label: string;
  message?: string;
  background: boolean;
  model?: SimModel;
  recovered?: RecoveryEntry;
  recoverable?: boolean;
  work: (forge: ForgeRunner, signal: AbortSignal) => Promise<void>;
}

export interface JobRow {
  target: SkillTarget;
  label: string;
  message?: string;
}
