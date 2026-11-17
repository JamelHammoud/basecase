import type { Case } from '../cases/schema';
import type { SimModel } from '../sim/mjcfTypes';
import type { KeyValueStore } from '../utils/keyValueStore';
import { modelHashes } from './artifacts';
import type { ForgeJob } from './forgeRunner';
import { hashOf } from './hash';
import type { JobRow } from './skillsRuntimeTypes';
import type { SkillsJob } from './skillsJob';

export type RecoverableSkillJob = Extract<SkillsJob, { type: 'kit' | 'move' | 'race' }>;

export type RecoveryRequest =
  | { type: 'worker'; job: RecoverableSkillJob }
  | { type: 'tries'; model: SimModel; kase: Case; job: ForgeJob; datasetId?: string };

export interface RecoveryEntry extends JobRow {
  id: string;
  judgmentSalt: string;
  context: string;
  fingerprint: string;
  request: RecoveryRequest;
}

interface RecoveryOptions {
  workspaceId: string;
  store: KeyValueStore<RecoveryEntry>;
  selected: () => Promise<boolean>;
}

export function recoveryModel(request: RecoveryRequest): SimModel {
  if (request.type === 'tries') return request.model;

  return request.job.model;
}

export const recoveryFingerprint = (model: SimModel) => hashOf(modelHashes(model));
export const DESIGN_CHANGED = 'The design changed. Start training on the current design.';

export class ChangedRecovery extends Error {
  entry: RecoveryEntry;

  constructor(entry: RecoveryEntry) {
    super(DESIGN_CHANGED);
    this.entry = entry;
  }
}

export class SkillRecovery {
  context = '';
  private active: (JobRow & { id: string; context: string; judgmentSalt: string }) | null = null;
  private preserved = false;
  private currentFingerprint: string | null = null;
  private activeFingerprint: string | null = null;
  private dirty = false;

  private options: RecoveryOptions;

  constructor(options: RecoveryOptions) {
    this.options = options;
  }

  get judgmentSalt() {
    return this.active?.judgmentSalt;
  }

  get key() {
    return this.active?.id;
  }

  async begin(row: JobRow, recovered?: RecoveryEntry) {
    this.preserved = false;
    this.activeFingerprint = recovered?.fingerprint ?? null;
    this.active = recovered ?? null;

    if (recovered || !(await this.options.selected())) return;

    this.active = {
      target: row.target,
      label: row.label,
      id: crypto.randomUUID(),
      context: this.context,
      judgmentSalt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    };
  }

  async capture(request: RecoveryRequest) {
    if (!this.active) return;

    const entry = {
      ...this.active,
      request,
      fingerprint: recoveryFingerprint(recoveryModel(request)),
    };

    this.activeFingerprint = entry.fingerprint;
    await this.options.store.put(this.options.workspaceId, entry);
  }

  async load(model: SimModel): Promise<RecoveryEntry | null> {
    const stored = await this.options.store.get(this.options.workspaceId);

    if (!stored) return null;

    if (stored.context !== this.context || stored.fingerprint !== recoveryFingerprint(model))
      throw new ChangedRecovery(stored);

    return stored;
  }

  invalidate() {
    this.dirty = true;
  }

  observe(model: SimModel) {
    this.dirty = false;
    this.currentFingerprint = recoveryFingerprint(model);
  }

  assertCurrent() {
    if (!this.active || this.activeFingerprint === null) return;

    if (
      this.dirty ||
      this.active.context !== this.context ||
      (this.currentFingerprint !== null && this.activeFingerprint !== this.currentFingerprint)
    )
      throw new Error(DESIGN_CHANGED);
  }

  discard() {
    return this.options.store.delete(this.options.workspaceId);
  }

  preserve() {
    this.preserved = true;
  }

  async finish() {
    const remove = this.active && !this.preserved;

    this.active = null;

    if (remove) await this.options.store.delete(this.options.workspaceId);
  }
}
