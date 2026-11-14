import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from './artifacts';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import type { KitWarm } from './motorKit';
import type { SkillRunner } from './skillsClient';
import type { SkillRecord } from './skillRecords';
import type { SkillJob, SkillRefusal, SkillTarget } from './skillRows';
import type { StressReport } from './skillsStress';
import type { SnapshotRef, Snapshots } from './snapshots';
import type { ForgeProgress } from './trainerForge';

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
  onStress?: (target: SkillTarget, report: StressReport | null) => void;
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

export interface Run {
  target: SkillTarget;
  label: string;
  message?: string;
  background: boolean;
  model?: SimModel;
  work: (forge: ForgeRunner, signal: AbortSignal) => Promise<void>;
}

export interface JobRow {
  target: SkillTarget;
  label: string;
  message?: string;
}
