import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { stagedEffectors } from '../cases/caseCast';
import { pivotAt, realRecording, type RealSample } from '../cases/mat/realTry';
import type { Case } from '../cases/schema';
import { scoreTry, tryManifest, type TryRecord } from '../cases/tries';
import { saveRecording } from '../cases/tryStore';
import {
  closeMatTracking,
  MAT_TRACKING_STOPPED,
  matTrackingSnapshot,
  onMatSample,
  openMatTracking,
  useMatTracking,
} from '../cameras/mat/matTracking';
import type { FloorPoint } from '../cameras/mat/tag36h11';
import type { MatSample } from '../cameras/mat/matTracker';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { StagedMat } from './useCaseMat';
import type { TryPhase } from './useCaseTry';

interface RealTryOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  blocked: boolean;
  matOf: () => StagedMat | null;
  viewportRef: RefObject<Viewport3DHandle | null>;
  onStart: () => void;
  onTry: (record: TryRecord) => void;
  onRefuse: (message: string) => void;
}

export interface RealTry {
  phase: TryPhase;
  elapsed: number;
  samples: () => number;
  start: () => Promise<void>;
  end: () => void;
}

interface Running extends StagedMat {
  kase: Case;
  t0: number | null;
  samples: RealSample[];
  path: Array<FloorPoint | null>;
}

const CLOCK_STEP = 0.1;
const END_SLACK = 1e-6;

const newTryId = () => `try-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function lostTo(tracking: ReturnType<typeof useMatTracking>, running: boolean): string | null {
  if (!running) return null;

  return tracking.refusal ?? (tracking.error ? MAT_TRACKING_STOPPED : null);
}

export function useRealTry(options: RealTryOptions): RealTry {
  const { sim, rig, parts, active, blocked, matOf, viewportRef, onStart, onTry, onRefuse } = options;
  const tracking = useMatTracking();
  const [phase, setPhase] = useState<TryPhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const run = useRef<Running | null>(null);
  const finishing = useRef(false);

  const settle = () => {
    run.current = null;
    finishing.current = false;
    setElapsed(0);
    setPhase('idle');
  };

  const recordOf = async (current: Running): Promise<TryRecord> => {
    const { staged, mat, kase, samples } = current;
    const seconds = Math.min(kase.task.seconds, samples.at(-1)?.t ?? 0);
    const model = sim.modelNow() ?? (await sim.buildModel());
    const recording = realRecording({ samples, seconds }, { model, rig, base: mat.base });
    const verdict = await scoreTry({
      kase: staged.kase,
      model,
      recording,
      rig,
      ...stagedEffectors(staged, { rig, parts }),
    });
    const id = newTryId();

    await saveRecording(id, recording);

    return {
      id,
      caseId: kase.id,
      robot: rig.robots[0]?.name ?? 'Robot',
      at: new Date().toISOString(),
      passed: verdict.passed,
      margin: verdict.margin,
      seconds: recording.frames * recording.dt,
      manifest: await tryManifest(staged.kase, model, recording),
      real: true,
    };
  };

  const finish = async () => {
    const current = run.current;

    if (!current || finishing.current) return;

    finishing.current = true;
    closeMatTracking();
    viewportRef.current?.setMatTrack(null);
    setPhase('scoring');

    try {
      if (current.samples.length) onTry(await recordOf(current));
    } finally {
      settle();
    }
  };

  const take = (sample: MatSample) => {
    const current = run.current;

    if (!current || finishing.current) return;

    current.t0 ??= sample.t;

    const t = sample.t - current.t0;

    current.samples.push({ t, base: sample.base });
    current.path.push(sample.base && pivotAt(sample.base, current.mat.base, current.mat.path[0]));
    viewportRef.current?.setMatTrack({ marker: sample.base, real: current.path, sim: [] });
    setElapsed(Math.floor(t / CLOCK_STEP) * CLOCK_STEP);

    if (t >= current.kase.task.seconds - END_SLACK) void finish();
  };

  const listening = phase === 'starting' || phase === 'running';
  const takeFromEffect = useEffectEvent(take);

  useEffect(() => {
    if (!listening) return;

    return onMatSample((sample) => takeFromEffect(sample));
  }, [listening]);

  useEffect(() => {
    if (!listening) return;

    return () => {
      if (!finishing.current) closeMatTracking();
    };
  }, [listening]);

  const lost = lostTo(tracking, phase === 'running');
  const dropFromEffect = useEffectEvent((message: string) => {
    if (!run.current || finishing.current) return;

    closeMatTracking();
    viewportRef.current?.setMatTrack(null);
    onRefuse(message);
    settle();
  });

  useEffect(() => {
    if (!lost) return;

    const soon = setTimeout(() => dropFromEffect(lost), 0);

    return () => clearTimeout(soon);
  }, [lost]);

  const start = async () => {
    const made = active && phase === 'idle' && !blocked ? matOf() : null;

    if (!active || !made) return;

    onStart();
    run.current = { ...made, kase: active, t0: null, samples: [], path: [] };
    setElapsed(0);
    setPhase('starting');

    const refusal = await openMatTracking(made.mat);

    if (!refusal && matTrackingSnapshot().open) return setPhase('running');

    if (refusal) onRefuse(refusal);

    settle();
  };

  return {
    phase,
    elapsed,
    samples: () => run.current?.samples.length ?? 0,
    start,
    end: () => void finish(),
  };
}
