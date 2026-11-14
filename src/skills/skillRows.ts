import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Freshness } from './artifacts';
import type { TrainedEntry } from './kitEnvironment';
import { kitEntries } from './motorKit';
import { moveAnimations } from './moveEnvironment';
import { arenaLine, recordFreshness, type SkillRecord } from './skillRecords';
import type { SnapshotRef } from './snapshots';

export type SkillTarget = `kit:${TrainedEntry}` | `move:${string}` | `goal:${string}`;

export interface SkillJob {
  target: SkillTarget;
  label: string;
  share: number | null;
  message: string;
  background: boolean;
  snapshot?: SnapshotRef | null;
}

export type SkillState =
  | { kind: 'training'; share: number | null; message: string; background: boolean; snapshot: SnapshotRef | null }
  | { kind: 'ready'; arena: string }
  | { kind: 'recheck' }
  | { kind: 'untrained'; refused?: string };

export interface SkillRow {
  target: SkillTarget;
  label: string;
  kit: TrainedEntry | null;
  move: RobotAnimation | null;
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

export type SkillRefusals = Partial<Record<SkillTarget, string>>;

interface RowInput extends DesignInput {
  records: SkillRecord[];
  jobs: SkillJob[];
  animations?: readonly RobotAnimation[];
  refusals?: SkillRefusals;
}

function best(records: SkillRecord[], input: DesignInput) {
  const ranked = records
    .map((record) => ({ record, freshness: recordFreshness(record, input) }))
    .sort((a, b) => RANK[a.freshness] - RANK[b.freshness] || b.record.createdAt.localeCompare(a.record.createdAt));

  return ranked[0] ?? null;
}

const readyEvidence = (found: ReturnType<typeof best> | null) =>
  found?.freshness === 'fresh' ? (found.record.evidence ?? null) : null;

function stateOf(found: ReturnType<typeof best> | null, job: SkillJob | undefined, refused?: string): SkillState {
  if (job)
    return {
      kind: 'training',
      share: job.share,
      message: job.message,
      background: job.background,
      snapshot: job.snapshot ?? null,
    };

  const evidence = readyEvidence(found);

  if (evidence) return { kind: 'ready', arena: arenaLine(evidence) };

  if (found?.freshness === 'rerun-arena') return { kind: 'recheck' };

  return refused ? { kind: 'untrained', refused } : { kind: 'untrained' };
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
      move: null,
      record: found?.record ?? null,
      state: stateOf(
        found,
        input.jobs.find((j) => j.target === target),
        input.refusals?.[target],
      ),
      drives: entry === 'velocity-tracking',
    };
  });
}

function moveRows(input: RowInput): SkillRow[] {
  return moveAnimations(input.model, input.animations ?? []).map((move) => {
    const target: SkillTarget = `move:${move.id}`;
    const found = best(
      input.records.filter((r) => r.move?.animation === move.id),
      input,
    );

    return {
      target,
      label: move.name,
      kit: null,
      move,
      record: found?.record ?? null,
      state: stateOf(
        found,
        input.jobs.find((j) => j.target === target),
      ),
      drives: false,
    };
  });
}

function taughtRows(input: RowInput): SkillRow[] {
  const taught = input.records.filter((r) => !r.kit && !r.move);
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
      move: null,
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
      move: null,
      record: null,
      state: stateOf(null, job),
      drives: false,
    }));

  return [...known, ...pending];
}

export function skillRows(input: RowInput): SkillRow[] {
  return [...kitRows(input), ...moveRows(input), ...taughtRows(input)];
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
