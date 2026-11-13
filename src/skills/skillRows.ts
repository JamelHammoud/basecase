import type { SimModel } from '../sim/mjcfTypes';
import type { Freshness } from './artifacts';
import type { TrainedEntry } from './kitEnvironment';
import { kitEntries } from './motorKit';
import { arenaLine, recordFreshness, type SkillRecord } from './skillRecords';

export type SkillTarget = `kit:${TrainedEntry}` | `goal:${string}`;

export interface SkillJob {
  target: SkillTarget;
  label: string;
  share: number | null;
  message: string;
  background: boolean;
}

export type SkillState =
  | { kind: 'training'; share: number | null; message: string; background: boolean }
  | { kind: 'ready'; arena: string }
  | { kind: 'recheck' }
  | { kind: 'untrained' };

export interface SkillRow {
  target: SkillTarget;
  label: string;
  kit: TrainedEntry | null;
  record: SkillRecord | null;
  state: SkillState;
  drives: boolean;
}

export const KIT_LABELS: Record<TrainedEntry, string> = {
  stand: 'Stand',
  'velocity-tracking': 'Walk',
  'get-up': 'Get up',
  'settle-to-neutral': 'Settle',
};

const RANK: Record<Freshness, number> = { fresh: 0, 'rerun-arena': 1, 'needs-training': 2 };

interface DesignInput {
  model: SimModel;
  design: string;
}

interface RowInput extends DesignInput {
  records: SkillRecord[];
  jobs: SkillJob[];
}

function best(records: SkillRecord[], input: DesignInput) {
  const ranked = records
    .map((record) => ({ record, freshness: recordFreshness(record, input) }))
    .sort((a, b) => RANK[a.freshness] - RANK[b.freshness] || b.record.createdAt.localeCompare(a.record.createdAt));

  return ranked[0] ?? null;
}

const readyEvidence = (found: ReturnType<typeof best> | null) =>
  found?.freshness === 'fresh' ? (found.record.evidence ?? null) : null;

function stateOf(found: ReturnType<typeof best> | null, job: SkillJob | undefined): SkillState {
  if (job) return { kind: 'training', share: job.share, message: job.message, background: job.background };

  const evidence = readyEvidence(found);

  if (evidence) return { kind: 'ready', arena: arenaLine(evidence) };

  return found?.freshness === 'rerun-arena' ? { kind: 'recheck' } : { kind: 'untrained' };
}

function kitRows(input: RowInput): SkillRow[] {
  return kitEntries(input.model).map((entry) => {
    const target: SkillTarget = `kit:${entry}`;
    const found = best(
      input.records.filter((r) => r.kit === entry),
      input,
    );

    return {
      target,
      label: KIT_LABELS[entry],
      kit: entry,
      record: found?.record ?? null,
      state: stateOf(
        found,
        input.jobs.find((j) => j.target === target),
      ),
      drives: entry === 'velocity-tracking',
    };
  });
}

function taughtRows(input: RowInput): SkillRow[] {
  const taught = input.records.filter((r) => !r.kit);
  const names = [...new Set(taught.map((r) => r.name))];
  const known = names.map((name): SkillRow => {
    const target: SkillTarget = `goal:${name}`;
    const found = best(
      taught.filter((r) => r.name === name),
      input,
    );

    return {
      target,
      label: found?.record.goal ?? name,
      kit: null,
      record: found?.record ?? null,
      state: stateOf(
        found,
        input.jobs.find((j) => j.target === target),
      ),
      drives: false,
    };
  });
  const pending = input.jobs
    .filter((j) => j.target.startsWith('goal:') && !names.includes(j.target.slice(5)))
    .map((job): SkillRow => ({
      target: job.target,
      label: job.label,
      kit: null,
      record: null,
      state: stateOf(null, job),
      drives: false,
    }));

  return [...known, ...pending];
}

export function skillRows(input: RowInput): SkillRow[] {
  return [...kitRows(input), ...taughtRows(input)];
}

export const readyVelocity = (rows: SkillRow[]) =>
  rows.find((r) => r.kit === 'velocity-tracking' && r.state.kind === 'ready')?.record ?? null;

export function readyWalkRecord(input: DesignInput & { records: SkillRecord[] }): SkillRecord | null {
  const found = best(
    input.records.filter((r) => r.kit === 'velocity-tracking'),
    input,
  );

  return found && readyEvidence(found) ? found.record : null;
}
