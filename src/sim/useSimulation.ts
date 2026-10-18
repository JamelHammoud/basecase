import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ProjectSettings, RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Controller, SimStats } from './engine';
import { buildMjcf, quatToMj, toMj, simDeltas, type SimModel } from './mjcf';
import type { SimRequest, SimResponse } from './sim.worker';
import { newSimWorker, useSimWorker } from './useSimWorker';

export { simDeltas } from './mjcf';

export type SimStatus = 'off' | 'loading' | 'ready' | 'error';

export interface SimRun {
  stats: SimStats;
  frames: Array<{ t: number; deltas: Map<string, THREE.Matrix4> }>;
  model: SimModel;
}

export interface Simulation {
  status: SimStatus;
  playing: boolean;
  stats: SimStats | null;
  error: string | null;
  model: SimModel | null;
  version: string | null;
  speed: number;
  controller: Controller;
  start: () => Promise<void>;
  play: () => void;
  pause: () => void;
  reset: () => void;
  stop: () => void;
  setSpeed: (s: number) => void;
  setController: (c: Controller) => void;
  grab: (
    partIds: string[],
    hand: { position: THREE.Vector3; turn: THREE.Quaternion | null } | null,
    phase: 'start' | 'move' | 'end',
  ) => void;
  push: (robot?: string) => void;
  buildModel: () => SimModel;
  run: (opts: {
    seconds: number;
    controller: Controller;
    pushes?: Array<{ at: number; robot?: string; force: [number, number, number] }>;
    frames?: number[];
  }) => Promise<SimRun>;
}

interface Inputs {
  parts: ScenePart[];
  project: ProjectSettings;
  rig: Rig;
  pose: RobotPoseState | undefined;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  restDeltas: Map<string, THREE.Matrix4>;
}

type RunOptions = Parameters<Simulation['run']>[0];

type GrabHand = Parameters<Simulation['grab']>[1];

function grabRequest(
  m: SimModel,
  partIds: string[],
  hand: GrabHand,
  phase: 'start' | 'move' | 'end',
): SimRequest | null {
  if (phase === 'end' || !hand) return { type: 'grab', phase: 'end' };

  if (phase === 'start') {
    const body = m.bodies.findIndex((b) => b.parts.some((id) => partIds.includes(id)));

    return body >= 0 ? { type: 'grab', phase: 'start', body, point: toMj(hand.position) } : null;
  }

  return { type: 'grab', phase: 'move', point: toMj(hand.position), turn: hand.turn ? quatToMj(hand.turn) : null };
}

function pushRequest(m: SimModel | null, robot: string | undefined): SimRequest | null {
  const key = robot ?? m?.robots.find((r) => r.floating)?.key ?? m?.robots[0]?.key;

  if (!m || !key) return null;

  const n = (m.massKg[key] || 1) * 9.81 * 0.5;
  const a = Math.random() * Math.PI * 2;

  return { type: 'push', robot: key, force: [Math.cos(a) * n, 0, Math.sin(a) * n] };
}

async function runModel(
  m: SimModel,
  { seconds, controller: c, pushes, frames }: RunOptions,
  id: number,
): Promise<SimRun> {
  const w = newSimWorker();

  try {
    const result = await new Promise<{ stats: SimStats; frames: Array<{ t: number; poses: Float64Array }> }>(
      (resolve, reject) => {
        w.onmessage = (ev: MessageEvent<SimResponse>) => {
          const msg = ev.data;

          if (msg.type === 'ready') {
            const key = m.robots.find((r) => r.floating)?.key ?? m.robots[0]?.key ?? '';

            w.postMessage({
              type: 'run',
              id,
              seconds,
              frames,
              pushes: pushes?.map((p) => ({ at: p.at, robot: p.robot ?? key, force: p.force })),
            } satisfies SimRequest);
          } else if (msg.type === 'error') reject(new Error(msg.message));
          else if (msg.type === 'ran') resolve({ stats: msg.stats, frames: msg.frames });
        };
        w.onerror = (e) => reject(new Error(e.message || 'The simulator stopped.'));
        w.postMessage({ type: 'load', model: m, controller: c } satisfies SimRequest);
      },
    );

    return {
      stats: result.stats,
      frames: result.frames.map((f) => ({ t: f.t, deltas: simDeltas(m, f.poses) })),
      model: m,
    };
  } finally {
    w.terminate();
  }
}

export function useSimulation({ parts, project, rig, pose, viewportRef, restDeltas }: Inputs): Simulation {
  const [model, setModel] = useState<SimModel | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [controller, setControllerState] = useState<Controller>({ kind: 'hold' });
  const modelRef = useRef<SimModel | null>(null);
  const inputs = useRef({ parts, project, rig, pose, restDeltas });

  useLayoutEffect(() => {
    inputs.current = { parts, project, rig, pose, restDeltas };
  });

  const runSeq = useRef(0);
  const { status, setStatus, playing, setPlaying, stats, setStats, error, setError, version, send, worker, load } =
    useSimWorker(viewportRef, modelRef);

  const buildModel = useCallback((): SimModel => {
    const vp = viewportRef.current;

    if (!vp) throw new Error('The canvas isn’t ready.');

    const { parts, project, rig, pose } = inputs.current;

    return buildMjcf({
      parts,
      rig,
      project,
      pose,
      measures: vp.measureParts(),
      partTriangles: vp.partTriangles,
      posedFloor: vp.posedFloor(),
    });
  }, [viewportRef]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('loading');

    let m: SimModel;

    try {
      m = buildModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');

      return;
    }

    modelRef.current = m;
    setModel(m);

    const w = worker();
    const loaded = await load(w, m, controller);

    if (!loaded) return;

    w.postMessage({ type: 'speed', value: speed } satisfies SimRequest);
    w.postMessage({ type: 'play' } satisfies SimRequest);
    setPlaying(true);
  }, [buildModel, worker, load, controller, speed, setError, setStatus, setPlaying]);

  const stop = useCallback(() => {
    send({ type: 'dispose' });
    modelRef.current = null;
    setModel(null);
    setStatus('off');
    setPlaying(false);
    setStats(null);
    viewportRef.current?.setPose(inputs.current.restDeltas);
  }, [viewportRef, send, setModel, setStatus, setPlaying, setStats]);

  const sceneKey = useRef({ parts, joints: project.joints });

  useEffect(() => {
    const prev = sceneKey.current;

    sceneKey.current = { parts, joints: project.joints };

    if (modelRef.current && (prev.parts !== parts || prev.joints !== project.joints)) stop();
  }, [parts, project.joints, stop]);

  const setController = useCallback(
    (c: Controller) => {
      setControllerState(c);
      send({ type: 'controller', controller: c });
    },
    [send],
  );

  return {
    status,
    playing,
    stats,
    error,
    model,
    version,
    speed,
    controller,
    start,
    play: () => {
      send({ type: 'play' });
      setPlaying(true);
    },
    pause: () => send({ type: 'pause' }),
    reset: () => send({ type: 'reset' }),
    stop,
    setSpeed: (s) => {
      setSpeedState(s);
      send({ type: 'speed', value: s });
    },
    setController,
    buildModel,
    grab: (partIds, hand, phase) => {
      const m = modelRef.current;
      const msg = m && grabRequest(m, partIds, hand, phase);

      if (msg) send(msg);
    },
    push: (robot) => {
      const msg = pushRequest(modelRef.current, robot);

      if (msg) send(msg);
    },
    run: async (opts) => {
      const m = buildModel();

      return runModel(m, opts, ++runSeq.current);
    },
  };
}
