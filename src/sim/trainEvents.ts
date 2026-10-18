import type { Dispatch, SetStateAction } from 'react';
import type { PolicyRecord } from '../types/robotics';
import type { TrainerStatus } from '../utils/platformBridge';
import type { TrainTask } from './policy';
import type { TrainProgress, Training } from './useTraining';

export interface TrainJob {
  id: string | null;
  task: TrainTask;
}

export interface TrainEventContext {
  job: { current: TrainJob | null };
  onPolicy: (record: PolicyRecord) => void;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<Training['status']>>;
  setProgress: Dispatch<SetStateAction<TrainProgress | null>>;
  setCurve: Dispatch<SetStateAction<number[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setTrainer: Dispatch<SetStateAction<TrainerStatus | null>>;
}

export const NEEDS_LEGS = 'Training needs a robot that stands on its own legs.';

export function savedPolicyMessage(record: PolicyRecord, task: TrainTask): string {
  const e = record.eval;

  if (!e) return `Saved ${record.name}`;

  if (e.fellAt !== null)
    return `Saved ${record.name}. Falls after ${e.fellAt.toFixed(1)} s. Train longer, or fix what the simulation shows.`;

  if (task === 'walk') return `Saved ${record.name}. Walked ${Math.max(0, e.forward).toFixed(2)} m in ${e.seconds} s.`;

  return `Saved ${record.name}. Stood ${e.seconds} s without falling.`;
}

export function trainingBlocker(robotKey: string | null, trainer: TrainerStatus | null): string | null {
  if (!robotKey) return NEEDS_LEGS;

  if (trainer && !trainer.uv)
    return 'Training needs uv to set up Python. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh';

  if (trainer && !trainer.ready) return 'First training installs Python, MuJoCo and PyTorch (about 1 GB).';

  return null;
}

function onDone(ctx: TrainEventContext, record: PolicyRecord) {
  ctx.onPolicy(record);

  const task = ctx.job.current?.task ?? record.task;

  ctx.setMessage(savedPolicyMessage(record, task));
  ctx.setStatus('done');
  ctx.job.current = null;
  ctx.setTrainer((t) => (t ? { ...t, ready: true } : t));
}

function onStatusMessage(ctx: TrainEventContext, message: string) {
  ctx.setMessage(message);

  if (message.startsWith('Training')) ctx.setStatus('running');
}

function onProgress(ctx: TrainEventContext, p: TrainProgress) {
  ctx.setStatus('running');
  ctx.setProgress(p);
  ctx.setCurve((c) => [...c, p.reward].slice(-300));
}

function onError(ctx: TrainEventContext, message: string) {
  ctx.setError(message);
  ctx.setStatus('error');
  ctx.job.current = null;
}

const HANDLERS: Record<string, (ctx: TrainEventContext, ev: Record<string, unknown>) => void> = {
  status: (ctx, ev) => onStatusMessage(ctx, String(ev.message)),
  progress: (ctx, ev) => onProgress(ctx, ev.progress as TrainProgress),
  done: (ctx, ev) => onDone(ctx, ev.record as PolicyRecord),
  error: (ctx, ev) => onError(ctx, String(ev.message)),
};

export function handleTrainEvent(ctx: TrainEventContext, workspaceId: string, ev: Record<string, unknown>) {
  if (ev.type !== 'train-progress' || ev.workspaceId !== workspaceId) return;

  const job = ctx.job.current;

  if (!job || (job.id && ev.jobId !== job.id)) return;

  if (!job.id) job.id = String(ev.jobId);

  const handler = Object.hasOwn(HANDLERS, ev.kind as string) ? HANDLERS[ev.kind as string] : undefined;

  handler?.(ctx, ev);
}
