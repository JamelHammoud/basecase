import { useCallback, useEffect, useRef, useState } from 'react';
import type { PolicyRecord } from '../types/robotics';
import { platformBridge, type TrainerStatus } from '../utils/platformBridge';
import type { SimModel } from './mjcf';
import { isPolicySpec, type PolicySpec, type TrainTask } from './policy';

export interface TrainOptions {
  task: TrainTask;
  minutes: number;
  /** Forward m/s, left m/s, turn rad/s */
  command: [number, number, number];
}

export interface TrainProgress {
  iteration: number;
  steps: number;
  elapsedS: number;
  budgetS: number;
  /** Mean reward per second of the last batch */
  reward: number;
  /** How long episodes last before a fall or the time limit (s) */
  episodeS: number;
  fps: number;
}

export interface Training {
  status: 'idle' | 'setup' | 'running' | 'done' | 'error';
  message: string | null;
  error: string | null;
  progress: TrainProgress | null;
  /** Reward per batch, for the curve */
  curve: number[];
  canTrain: boolean;
  /** Why training can't start, when it can't */
  blocker: string | null;
  /** Starts training; resolves with why it couldn't, or null once it's running */
  start: (opts: TrainOptions) => Promise<string | null>;
  stop: () => void;
  loadPolicy: (id: string) => Promise<PolicySpec | null>;
}

const D2R = Math.PI / 180;

/** The trainer's job for one robot of a model: its joints, start pose and task */
export function trainingJob(model: SimModel, robotKey: string, opts: TrainOptions, name: string) {
  const robot = model.robots.find((r) => r.key === robotKey)!;
  const joints = model.joints.filter((j) => j.robot === robotKey);
  const unit = (j: SimModel['joints'][number], v: number) => (j.type === 'revolute' ? v * D2R : v / 1000);
  const initial = (j: SimModel['joints'][number]) => unit(j, model.initial.values[j.id] ?? 0);
  const root = model.initial.roots?.[robotKey]?.position ?? [0, 0, 0];
  return {
    name,
    task: opts.task,
    minutes: opts.minutes,
    command: opts.command,
    robotKey,
    robotName: robot.name,
    root: robot.root,
    joints: joints.map((j) => ({ id: j.id, name: j.name })),
    defaultPose: joints.map(initial),
    // Every actuator's hold target (other robots keep their pose)
    ctrlDefault: model.joints.map(initial),
    initialJoints: Object.fromEntries(model.joints.map((j) => [j.name, initial(j)])),
    // Scene mm (Y up) → MuJoCo m (Z up)
    rootOffset: [root[0] / 1000, -root[2] / 1000, root[1] / 1000],
    actionScale: 0.25,
    controlDt: 0.02,
  };
}

/** Policy training for one scene tab: runs the Python trainer and keeps the finished policies */
export function useTraining({
  workspaceId,
  buildModel,
  robotKey,
  policies,
  onPolicy,
}: {
  workspaceId: string;
  buildModel: () => SimModel;
  /** The robot to train (the selected one, else the first that can stand) */
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
  const job = useRef<{ id: string | null; task: TrainTask } | null>(null);
  const onPolicyRef = useRef(onPolicy);
  useEffect(() => {
    onPolicyRef.current = onPolicy;
  });

  useEffect(() => {
    platformBridge.trainStatus().then(setTrainer, () => setTrainer(null));
  }, []);

  useEffect(
    () =>
      platformBridge.subscribeEvents((ev) => {
        if (ev.type !== 'train-progress' || ev.workspaceId !== workspaceId) return;
        // Only the job this tab started (a reloaded page doesn't adopt an older one)
        if (!job.current || (job.current.id && ev.jobId !== job.current.id)) return;
        if (!job.current.id) job.current.id = String(ev.jobId);
        const kind = ev.kind as string;
        if (kind === 'status') {
          setMessage(String(ev.message));
          if (String(ev.message).startsWith('Training')) setStatus('running');
        } else if (kind === 'progress') {
          const p = ev.progress as TrainProgress;
          setStatus('running');
          setProgress(p);
          setCurve((c) => [...c, p.reward].slice(-300));
        } else if (kind === 'done') {
          const record = ev.record as PolicyRecord;
          onPolicyRef.current(record);
          const e = record.eval;
          const task = job.current?.task ?? record.task;
          setMessage(
            !e
              ? `Saved ${record.name}`
              : e.fellAt !== null
                ? `Saved ${record.name}. Falls after ${e.fellAt.toFixed(1)} s. Train longer, or fix what the simulation shows.`
                : task === 'walk'
                  ? `Saved ${record.name}. Walked ${Math.max(0, e.forward).toFixed(2)} m in ${e.seconds} s.`
                  : `Saved ${record.name}. Stood ${e.seconds} s without falling.`
          );
          setStatus('done');
          job.current = null;
          setTrainer((t) => (t ? { ...t, ready: true } : t));
        } else if (kind === 'error') {
          setError(String(ev.message));
          setStatus('error');
          job.current = null;
        }
      }),
    [workspaceId]
  );

  const start = useCallback(
    async (opts: TrainOptions): Promise<string | null> => {
      if (!robotKey) return 'Training needs a robot that stands on its own legs.';
      setError(null);
      setProgress(null);
      setCurve([]);
      setStatus('setup');
      setMessage('Starting');
      try {
        const model = buildModel();
        const robot = model.robots.find((r) => r.key === robotKey);
        if (!robot?.floating) throw new Error('Training needs a robot that stands on its own legs.');
        const n = policies.filter((p) => p.task === opts.task && p.robot === robotKey).length + 1;
        const name = `${opts.task === 'walk' ? 'Walk' : 'Stand'} ${n}`;
        job.current = { id: null, task: opts.task };
        const res = await platformBridge.trainStart({ workspaceId, xml: model.xml, job: trainingJob(model, robotKey, opts, name) });
        if (job.current) job.current.id = res.jobId;
        return null;
      } catch (e) {
        job.current = null;
        const message = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);
        setError(message);
        setStatus('error');
        return message;
      }
    },
    [buildModel, robotKey, policies, workspaceId]
  );

  const stop = useCallback(() => {
    setMessage('Saving what it learned');
    void platformBridge.trainStop(workspaceId);
  }, [workspaceId]);

  const loadPolicy = useCallback(async (id: string) => {
    const spec = await platformBridge.getPolicy(id).catch(() => null);
    return isPolicySpec(spec) ? spec : null;
  }, []);

  const blocker = !robotKey
    ? 'Training needs a robot that stands on its own legs.'
    : trainer && !trainer.uv
      ? 'Training needs uv to set up Python. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh'
      : trainer && !trainer.ready
        ? 'First training installs Python, MuJoCo and PyTorch (about 1 GB).'
        : null;

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
