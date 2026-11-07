import { useCallback, useEffect, useRef, useState } from 'react';
import type { PolicyRecord } from '../types/robotics';
import { platformBridge, type TrainerStatus } from '../utils/platformBridge';
import type { SimModel } from './mjcf';
import { isPolicySpec, type PolicySpec } from './policy';
import { handleTrainEvent, NEEDS_LEGS, trainingBlocker, type TrainJob } from './trainEvents';
import { trainingJob, type TrainOptions } from './trainingJob';

export { trainingJob, type TrainOptions };

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
  start: (opts: TrainOptions) => Promise<string | null>;
  stop: () => void;
  loadPolicy: (id: string) => Promise<PolicySpec | null>;
}

export function useTraining({
  workspaceId,
  buildModel,
  robotKey,
  policies,
  onPolicy,
}: {
  workspaceId: string;
  buildModel: () => Promise<SimModel>;
  robotKey: string | null;
  policies: PolicyRecord[];
  onPolicy: (record: PolicyRecord) => void;
}): Training {
  const [status, setStatus] = useState<Training['status']>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TrainProgress | null>(null);
  const [curve, setCurve] = useState<number[]>([]);
  const [trainer, setTrainer] = useState<TrainerStatus | null>(null);
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
            onPolicy: (record) => onPolicyRef.current(record),
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
    async (opts: TrainOptions): Promise<string | null> => {
      if (!robotKey) return NEEDS_LEGS;

      setError(null);
      setProgress(null);
      setCurve([]);
      setStatus('setup');
      setMessage('Starting');

      try {
        const model = await buildModel();
        const robot = model.robots.find((r) => r.key === robotKey);

        if (!robot?.floating) throw new Error(NEEDS_LEGS);

        const n = policies.filter((p) => p.task === opts.task && p.robot === robotKey).length + 1;
        const name = `${opts.task === 'walk' ? 'Walk' : 'Stand'} ${n}`;

        job.current = { id: null, task: opts.task };

        const res = await platformBridge.trainStart({
          workspaceId,
          xml: model.xml,
          job: trainingJob(model, robotKey, opts, name),
        });

        if (job.current) job.current.id = res.jobId;

        return null;
      } catch (e) {
        job.current = null;

        const message =
          e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);

        setError(message);
        setStatus('error');

        return message;
      }
    },
    [buildModel, robotKey, policies, workspaceId],
  );

  const stop = useCallback(() => {
    setMessage('Saving what it learned');
    void platformBridge.trainStop(workspaceId);
  }, [workspaceId]);

  const loadPolicy = useCallback(async (id: string) => {
    const spec = await platformBridge.getPolicy(id).catch(() => null);

    return isPolicySpec(spec) ? spec : null;
  }, []);

  const blocker = trainingBlocker(robotKey, trainer);

  return {
    status,
    message,
    error,
    progress,
    curve,
    canTrain: !!robotKey && trainer?.uv !== false && status !== 'setup' && status !== 'running',
    blocker,
    start,
    stop,
    loadPolicy,
  };
}
