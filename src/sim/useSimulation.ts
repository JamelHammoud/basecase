import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ProjectSettings, RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Controller, SimStats } from './engine';
import { buildMjcf, fromMj, quatFromMj, quatToMj, toMj, type SimModel } from './mjcf';
import type { SimRequest, SimResponse } from './sim.worker';

export type SimStatus = 'off' | 'loading' | 'ready' | 'error';

export interface SimRun {
  stats: SimStats;
  /** Part motions (rest → simulated) at the requested times */
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
  /** Builds the model from the scene and starts it */
  start: () => Promise<void>;
  play: () => void;
  pause: () => void;
  reset: () => void;
  /** Ends the simulation; the canvas goes back to the posed model */
  stop: () => void;
  setSpeed: (s: number) => void;
  setController: (c: Controller) => void;
  /**
   * The canvas gizmo as a hand while the simulation runs: on start it grabs the selected parts'
   * root-most body at the hand's position; moves pull that point after the hand (and turn the body
   * when `turn` is given); end lets go. Parts never change.
   */
  grab: (partIds: string[], hand: { position: THREE.Vector3; turn: THREE.Quaternion | null } | null, phase: 'start' | 'move' | 'end') => void;
  /** Pushes a robot sideways with a share of its weight */
  push: (robot?: string) => void;
  /** The scene as a MuJoCo model right now (throws when the canvas isn't ready) */
  buildModel: () => SimModel;
  /** Builds a fresh model and runs it headless (agent checks); the live simulation is untouched */
  run: (opts: { seconds: number; controller: Controller; pushes?: Array<{ at: number; robot?: string; force: [number, number, number] }>; frames?: number[] }) => Promise<SimRun>;
}

interface Inputs {
  parts: ScenePart[];
  project: ProjectSettings;
  rig: Rig;
  pose: RobotPoseState | undefined;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  /** The posed canvas (joint deltas) to return to when the simulation stops */
  restDeltas: Map<string, THREE.Matrix4>;
}

/** Part motions (rest → simulated) from the worker's body poses */
export function simDeltas(model: SimModel, poses: Float64Array): Map<string, THREE.Matrix4> {
  const out = new Map<string, THREE.Matrix4>();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  model.bodies.forEach((b, i) => {
    if (!b.parts.length) return;
    const o = i * 7;
    const p = fromMj(poses[o], poses[o + 1], poses[o + 2]);
    quatFromMj(poses[o + 3], poses[o + 4], poses[o + 5], poses[o + 6], q);
    // T(p) · R · T(−origin): bodies keep the world's orientation at rest
    m.makeRotationFromQuaternion(q);
    const r = new THREE.Vector3(...b.origin).applyQuaternion(q);
    m.setPosition(p[0] - r.x, p[1] - r.y, p[2] - r.z);
    for (const id of b.parts) out.set(id, m.clone());
  });
  return out;
}

/** The scene's MuJoCo simulation: one worker per scene tab, started on demand */
export function useSimulation({ parts, project, rig, pose, viewportRef, restDeltas }: Inputs): Simulation {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<SimStatus>('off');
  const [playing, setPlaying] = useState(false);
  const [stats, setStats] = useState<SimStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<SimModel | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [controller, setControllerState] = useState<Controller>({ kind: 'hold' });
  const modelRef = useRef<SimModel | null>(null);
  const inputs = useRef({ parts, project, rig, pose, restDeltas });
  useLayoutEffect(() => {
    inputs.current = { parts, project, rig, pose, restDeltas };
  });
  const lastUi = useRef(0);
  const runSeq = useRef(0);
  const loadWaiter = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const send = (msg: SimRequest) => workerRef.current?.postMessage(msg);

  const handle = useCallback(
    (ev: MessageEvent<SimResponse>) => {
      const msg = ev.data;
      if (msg.type === 'ready') {
        setVersion(msg.version);
        setStatus('ready');
        loadWaiter.current?.resolve();
        loadWaiter.current = null;
      } else if (msg.type === 'error') {
        setError(msg.message);
        setStatus('error');
        setPlaying(false);
        loadWaiter.current?.reject(new Error(msg.message));
        loadWaiter.current = null;
      } else if (msg.type === 'frame') {
        const m = modelRef.current;
        if (!m) return;
        viewportRef.current?.setPose(simDeltas(m, msg.poses));
        const now = performance.now();
        if (now - lastUi.current > 100 || !msg.playing) {
          lastUi.current = now;
          setStats(msg.stats);
          setPlaying(msg.playing);
        }
      }
    },
    [viewportRef]
  );

  const worker = useCallback(() => {
    if (!workerRef.current) {
      const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = handle;
      w.onerror = (e) => {
        setError(e.message || 'The simulator stopped.');
        setStatus('error');
      };
      workerRef.current = w;
    }
    return workerRef.current;
  }, [handle]);

  useEffect(() => () => workerRef.current?.terminate(), []);

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
    const loaded = await new Promise<boolean>((resolve) => {
      loadWaiter.current = { resolve: () => resolve(true), reject: () => resolve(false) };
      w.postMessage({ type: 'load', model: m, controller } satisfies SimRequest);
    });
    if (!loaded) return;
    w.postMessage({ type: 'speed', value: speed } satisfies SimRequest);
    w.postMessage({ type: 'play' } satisfies SimRequest);
    setPlaying(true);
  }, [buildModel, worker, controller, speed]);

  const stop = useCallback(() => {
    send({ type: 'dispose' });
    modelRef.current = null;
    setModel(null);
    setStatus('off');
    setPlaying(false);
    setStats(null);
    viewportRef.current?.setPose(inputs.current.restDeltas);
  }, [viewportRef]);

  // The scene changed under a running simulation: its model is stale, so end it
  const sceneKey = useRef({ parts, joints: project.joints });
  useEffect(() => {
    const prev = sceneKey.current;
    sceneKey.current = { parts, joints: project.joints };
    if (modelRef.current && (prev.parts !== parts || prev.joints !== project.joints)) stop();
  }, [parts, project.joints, stop]);

  const setController = useCallback((c: Controller) => {
    setControllerState(c);
    send({ type: 'controller', controller: c });
  }, []);

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
      if (!m) return;
      if (phase === 'end' || !hand) {
        send({ type: 'grab', phase: 'end' });
        return;
      }
      if (phase === 'start') {
        // Bodies are listed root first, so the lowest index is the one nearest the robot's root
        const body = m.bodies.findIndex((b) => b.parts.some((id) => partIds.includes(id)));
        if (body >= 0) send({ type: 'grab', phase: 'start', body, point: toMj(hand.position) });
        return;
      }
      send({ type: 'grab', phase: 'move', point: toMj(hand.position), turn: hand.turn ? quatToMj(hand.turn) : null });
    },
    push: (robot) => {
      const m = modelRef.current;
      const key = robot ?? m?.robots.find((r) => r.floating)?.key ?? m?.robots[0]?.key;
      if (!m || !key) return;
      // Half its weight, sideways in a random direction, for 0.15 s
      const n = (m.massKg[key] || 1) * 9.81 * 0.5;
      const a = Math.random() * Math.PI * 2;
      send({ type: 'push', robot: key, force: [Math.cos(a) * n, 0, Math.sin(a) * n] });
    },
    run: async ({ seconds, controller: c, pushes, frames }) => {
      // Its own worker, so a live simulation keeps running untouched
      const m = buildModel();
      const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      try {
        const result = await new Promise<{ stats: SimStats; frames: Array<{ t: number; poses: Float64Array }> }>((resolve, reject) => {
          const id = ++runSeq.current;
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
        });
        return { stats: result.stats, frames: result.frames.map((f) => ({ t: f.t, deltas: simDeltas(m, f.poses) })), model: m };
      } finally {
        w.terminate();
      }
    },
  };
}
