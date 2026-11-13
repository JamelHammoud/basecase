import { isPolicySpec } from '../sim/policy';
import type { PolicyRecord } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import type { ForgeJob, ForgeOutcome, ForgeRunner } from './forgeRunner';
import { SNAPSHOT_EVERY_S, type SnapshotRef } from './snapshots';
import { errorMessage } from '../utils/errorMessage';

export interface ForgeProgress {
  share: number | null;
  message: string;
}

export interface TrainerForgeOptions {
  workspaceId: string;
  background: boolean;
  onProgress: (progress: ForgeProgress) => void;
  onSnapshot?: (ref: SnapshotRef) => void;
  signal?: AbortSignal;
}

type TrainEvent = Record<string, unknown>;

export const userTrainingKey = (workspaceId: string) => `skill:${workspaceId}`;

const failure = (stderr: string): ForgeOutcome => ({ ok: false, policy: null, events: [], stderr });

async function finished(ev: TrainEvent): Promise<ForgeOutcome> {
  if (ev.kind === 'error') return failure(String(ev.message ?? 'Training stopped.'));

  const record = ev.record as PolicyRecord;
  const spec = await platformBridge.getPolicy(record.id).catch(() => null);

  void platformBridge.deletePolicy(record.id).catch(() => false);

  if (!isPolicySpec(spec)) return failure('The trainer saved no policy.');

  return { ok: true, policy: spec, events: [{ type: 'done', steps: record.trainedSteps }], stderr: '', run: record.id };
}

interface ProgressEvent {
  message?: unknown;
  progress?: { elapsedS?: unknown; budgetS?: unknown };
}

export function trainingProgress(kind: unknown, event: ProgressEvent): ForgeProgress | null {
  if (kind === 'status') return { share: null, message: String(event.message ?? '') };

  if (kind !== 'progress') return null;

  const { elapsedS, budgetS } = event.progress ?? {};
  const share = typeof budgetS === 'number' && budgetS > 0 ? Math.min(1, Number(elapsedS ?? 0) / budgetS) : null;

  return { share, message: 'Training' };
}

const progressOf = (ev: TrainEvent) => trainingProgress(ev.kind, ev as ProgressEvent);

export function snapshotOf(ev: TrainEvent): SnapshotRef | null {
  const { kind, jobId, iteration, steps } = ev;

  if (kind !== 'snapshot' || typeof jobId !== 'string') return null;

  if (!Number.isSafeInteger(iteration) || !Number.isSafeInteger(steps)) return null;

  return { run: jobId, iteration: iteration as number, steps: steps as number };
}

function start(options: TrainerForgeOptions, job: ForgeJob): Promise<{ jobId: string | null }> {
  const payload = {
    workspaceId: options.workspaceId,
    xml: job.xml,
    job: { ...job.job, snapshotEveryS: SNAPSHOT_EVERY_S },
  };

  if (options.background) return platformBridge.kitRequest(payload);

  return platformBridge.trainStart({ ...payload, workspaceId: userTrainingKey(options.workspaceId) });
}

function stop(options: TrainerForgeOptions) {
  if (options.background) void platformBridge.kitCancel(options.workspaceId).catch(() => null);
  else void platformBridge.trainStop(userTrainingKey(options.workspaceId)).catch(() => null);
}

export function trainerForge(options: TrainerForgeOptions): ForgeRunner {
  return (job) =>
    new Promise<ForgeOutcome>((resolve) => {
      const early: TrainEvent[] = [];
      let jobId: string | null = null;
      let unsubscribe = () => {};
      const settle = (outcome: Promise<ForgeOutcome> | ForgeOutcome) => {
        unsubscribe();
        resolve(outcome);
      };
      const handle = (ev: TrainEvent) => {
        const progress = progressOf(ev);
        const snapshot = snapshotOf(ev);

        if (progress) options.onProgress(progress);

        if (snapshot) options.onSnapshot?.(snapshot);

        if (ev.kind === 'done' || ev.kind === 'error') settle(finished(ev));
      };

      unsubscribe = platformBridge.subscribeEvents((ev) => {
        if (ev.type !== 'train-progress') return;

        if (jobId === null) early.push(ev);
        else if (ev.jobId === jobId) handle(ev);
      });
      options.signal?.addEventListener('abort', () => {
        stop(options);
        settle(failure('Stopped.'));
      });
      start(options, job).then(
        (res) => {
          if (!res.jobId) return settle(failure('A newer design replaced this run.'));

          jobId = res.jobId;
          early.filter((ev) => ev.jobId === jobId).forEach(handle);
        },
        (e: unknown) => settle(failure(errorMessage(e))),
      );
    });
}
