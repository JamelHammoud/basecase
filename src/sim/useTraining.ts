import { useCallback, useEffect, useRef, useState } from 'react';
import type { PolicyRecord } from '../types/robotics';
import { platformBridge, type TrainerStatus } from '../utils/platformBridge';
import type { SimModel } from './mjcf';
import { isPolicySpec, type PolicySpec } from './policy';
import { isStalePolicy, type RobotFingerprints } from './policyFreshness';
import { handleTrainEvent, NEEDS_LEGS, trainingBlocker, type TrainJob } from './trainEvents';
import { trainingJob, type TrainOptions } from './trainingJob';

export { trainingJob, type TrainOptions };

export const DEFAULT_TRAIN_MINUTES = 20;

export interface TrainProgress {
  iteration: number;
  steps: number;
  elapsedS: number;
  budgetS: number;
  reward: number;
  episodeS: number;
  fps: number;
}

export interface Training {
  status: 'idle' | 'setup' | 'running' | 'done' | 'error';
  message: string | null;
  error: string | null;
  progress: TrainProgress | null;
  curve: number[];
  canTrain: boolean;
  blocker: string | null;
  retraining: string | null;
  start: (opts: TrainOptions, replacing?: PolicyRecord) => Promise<string | null>;
  retrain: (record: PolicyRecord) => Promise<string | null>;
  stop: () => void;
  loadPolicy: (id: string) => Promise<PolicySpec | null>;
  isStale: (record: PolicyRecord) => boolean;
}

const errorText = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);

const nextName = (policies: PolicyRecord[], task: TrainOptions['task'], robotKey: string) =>
  `${task === 'walk' ? 'Walk' : 'Stand'} ${policies.filter((p) => p.task === task && p.robot === robotKey).length + 1}`;

export function useTraining({
  workspaceId,
  buildModel,
  robotKey,
  policies,
  fingerprints,
  onPolicy,
}: {
  workspaceId: string;
  buildModel: () => Promise<SimModel>;
  robotKey: string | null;
  policies: PolicyRecord[];
  fingerprints: RobotFingerprints;
  onPolicy: (record: PolicyRecord, replaces: string | null) => void;
}): Training {
  const [status, setStatus] = useState<Training['status']>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TrainProgress | null>(null);
  const [curve, setCurve] = useState<number[]>([]);
  const [trainer, setTrainer] = useState<TrainerStatus | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const job = useRef<TrainJob | null>(null);
  const onPolicyRef = useRef(onPolicy);

  useEffect(() => {
    onPolicyRef.current = onPolicy;
  });

  useEffect(() => {
    platformBridge.trainStatus().then(setTrainer, () => setTrainer(null));
  }, []);

  useEffect(
    () =>
      platformBridge.subscribeEvents((ev) =>
        handleTrainEvent(
          {
            job,
            onPolicy: (record, replaces) => onPolicyRef.current(record, replaces),
            setMessage,
            setStatus,
            setProgress,
            setCurve,
            setError,
            setTrainer,
          },
          workspaceId,
          ev,
        ),
      ),
    [workspaceId],
  );

  const start = useCallback(
    async (opts: TrainOptions, replacing?: PolicyRecord): Promise<string | null> => {
      const key = replacing?.robot ?? robotKey;

      if (!key) return NEEDS_LEGS;

      setError(null);
      setProgress(null);
      setCurve([]);
      setStatus('setup');
      setMessage('Starting');
      setReplacing(replacing?.id ?? null);

      try {
        const model = await buildModel();

        if (!model.robots.find((r) => r.key === key)?.floating) throw new Error(NEEDS_LEGS);

        const name = replacing?.name ?? nextName(policies, opts.task, key);

        job.current = { id: null, task: opts.task, replaces: replacing?.id ?? null };

        const res = await platformBridge.trainStart({
          workspaceId,
          xml: model.xml,
          job: trainingJob(model, key, opts, name),
        });

        if (job.current) job.current.id = res.jobId;

        return null;
      } catch (e) {
        job.current = null;
        setError(errorText(e));
        setStatus('error');

        return errorText(e);
      }
    },
    [buildModel, robotKey, policies, workspaceId],
  );

  const retrain = (record: PolicyRecord) =>
    start({ task: record.task, minutes: record.minutes ?? DEFAULT_TRAIN_MINUTES, command: record.command }, record);

  const stop = useCallback(() => {
    setMessage('Saving what it learned');
    void platformBridge.trainStop(workspaceId);
  }, [workspaceId]);

  const loadPolicy = useCallback(async (id: string) => {
    const spec = await platformBridge.getPolicy(id).catch(() => null);

    return isPolicySpec(spec) ? spec : null;
  }, []);

  const blocker = trainingBlocker(robotKey, trainer);
  const busy = status === 'setup' || status === 'running';

  return {
    status,
    message,
    error,
    progress,
    curve,
    canTrain: !!robotKey && trainer?.uv !== false && !busy,
    blocker,
    retraining: busy || status === 'error' ? replacing : null,
    start,
    retrain,
    stop,
    loadPolicy,
    isStale: (record) => isStalePolicy(record, fingerprints),
  };
}
