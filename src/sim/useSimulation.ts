import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ProjectSettings, RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { DriveCommand } from './driveTypes';
import type { Controller, SimStats } from './engine';
import type { FaultKind } from './faults';
import { buildMjcf, simDeltas, type SimModel, type WorldItem } from './mjcf';
import type { TorqueSeries } from '../utils/peakTorque';
import type { SimRequest, SimResponse } from './sim.worker';
import type { RecordedEfforts } from './recordedFrames';
import type { Recording } from './recorder';
import type { Scan } from './scanner';
import type { LiveRoutineInput, LiveUpdate } from '../routines/routineLive';
import type { CaseFacts, FactValue } from '../cases/caseFacts';
import type { WorldChange } from '../cases/worldSet';
import { withLooks } from './worldLooks';
import type { LiveCaseInput } from '../cases/liveCase';
import type { WatchPlan } from '../skills/liveWatch';
import { useDrive, type SimDrive, type VelocitySource } from './useDrive';
import { useWatch } from './useWatch';
import { useSimTouches } from './useSimTouches';
import { calibratedInput } from '../reality/calibratedInput';
import { simCalibrations } from '../reality/history';
import { newSimWorker, useSimWorker, type CameraLink, type SimFrameMessage } from './useSimWorker';
import type { Sought } from './useRecordingLink';
import { NO_GUESTS, withGuests, type SimGuests } from './simGuests';
import type { AmpModel } from '../utils/servoAmps';
import { errorMessage } from '../utils/errorMessage';
import type { FallPlan, FallRun } from './fallRuns';

export interface SimFrame {
  joints: Float64Array;
}

export type SimStatus = 'off' | 'loading' | 'ready' | 'error';

export interface SimRun {
  stats: SimStats;
  frames: Array<{ t: number; deltas: Map<string, THREE.Matrix4>; poses: Float64Array }>;
  model: SimModel;
  trace?: TorqueSeries;
}

export interface Simulation {
  status: SimStatus;
  playing: boolean;
  stats: SimStats | null;
  latestStats: () => SimStats | null;
  latestScan: () => Scan | null;
  error: string | null;
  model: SimModel | null;
  modelNow: () => SimModel | null;
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
  push: (robot?: string, fallDeg?: number) => void;
  setFault: (jointId: string, kind: FaultKind | null) => void;
  drive: SimDrive;
  record: () => void;
  stopRecording: () => Promise<Recording | null>;
  scrub: (r: Recording | null) => Promise<RecordedEfforts | null>;
  seek: (frame: number) => void;
  sought: () => Sought | null;
  worldParts: ScenePart[];
  guestParts: ScenePart[];
  subscribePoses: (listen: (poses: Float64Array, frame: SimFrameMessage) => void) => () => void;
  connectCameras: (link: CameraLink | null) => void;
  setWorld: (items: WorldItem[], guests?: SimGuests) => void;
  buildModel: (options?: { alone?: boolean }) => Promise<SimModel>;
  runRoutine: (input: LiveRoutineInput, onUpdate: (update: LiveUpdate) => void) => Promise<boolean>;
  runCase: (input: LiveCaseInput | null) => void;
  watch: (plan: WatchPlan | null) => void;
  watchMargin: number | null;
  input: (name: string, value: FactValue) => void;
  world: (change: WorldChange) => void;
  latestFacts: () => CaseFacts | null;
  runOn: (model: SimModel, opts: RunOptions) => Promise<SimRun>;
  run: (opts: {
    seconds: number;
    controller: Controller;
    pushes?: Array<{ at: number; robot?: string; force: [number, number, number] }>;
    frames?: number[];
    forceLimits?: (model: SimModel) => Record<string, number>;
    trace?: boolean;
    currents?: Record<string, AmpModel>;
    commands?: Array<{ at: number; command: DriveCommand }>;
  }) => Promise<SimRun>;
  falls: (plan: (model: SimModel, robot: string) => FallPlan) => Promise<{ model: SimModel; runs: FallRun[] }>;
}

interface Inputs {
  parts: ScenePart[];
  project: ProjectSettings;
  rig: Rig;
  pose: RobotPoseState | undefined;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  restDeltas: Map<string, THREE.Matrix4>;
  velocity?: React.RefObject<VelocitySource | null>;
}

export type RunOptions = Parameters<Simulation['run']>[0];

type Ran = Extract<SimResponse, { type: 'ran' }>;

interface OneShot<T> {
  controller: Controller;
  ask: (robot: string) => SimRequest;
  answer: (msg: SimResponse) => T | undefined;
}

async function oneShot<T>(m: SimModel, { controller, ask, answer }: OneShot<T>): Promise<T> {
  const w = newSimWorker();

  try {
    return await new Promise<T>((resolve, reject) => {
      w.onmessage = (ev: MessageEvent<SimResponse>) => {
        const msg = ev.data;
        const done = answer(msg);

        if (msg.type === 'ready') w.postMessage(ask(m.robots.find((r) => r.floating)?.key ?? m.robots[0]?.key ?? ''));
        else if (msg.type === 'error') reject(new Error(msg.message));
        else if (done !== undefined) resolve(done);
      };
      w.onerror = (e) => reject(new Error(e.message || 'The simulator stopped.'));
      w.postMessage({ type: 'load', model: m, controller } satisfies SimRequest);
    });
  } finally {
    w.terminate();
  }
}

async function runModel(
  m: SimModel,
  { seconds, controller, pushes, frames, forceLimits, trace, currents, commands }: RunOptions,
  id: number,
): Promise<SimRun> {
  const result = await oneShot<Ran>(m, {
    controller,
    ask: (key) => ({
      type: 'run',
      id,
      seconds,
      frames,
      pushes: pushes?.map((p) => ({ at: p.at, robot: p.robot ?? key, force: p.force })),
      forceLimits: forceLimits?.(m),
      trace,
      currents,
      commands,
    }),
    answer: (msg) => (msg.type === 'ran' ? msg : undefined),
  });

  return {
    stats: result.stats,
    frames: result.frames.map((f) => ({ t: f.t, deltas: simDeltas(m, f.poses), poses: f.poses })),
    model: m,
    trace: result.trace,
  };
}

export const fallsOn = (m: SimModel, plan: (model: SimModel, robot: string) => FallPlan, id: number) =>
  oneShot<FallRun[]>(m, {
    controller: { kind: 'hold' },
    ask: (robot) => ({ type: 'falls', id, ...plan(m, robot) }),
    answer: (msg) => (msg.type === 'fell' ? msg.runs : undefined),
  });

interface SceneModelOptions {
  alone?: boolean;
  pin?: string | null;
}

function useSceneModel({ parts, project, rig, pose, viewportRef, restDeltas }: Inputs) {
  const inputs = useRef({ parts, project, rig, pose, restDeltas });
  const [worldParts, setWorldParts] = useState<WorldItem[]>([]);
  const worldRef = useRef<WorldItem[]>(worldParts);
  const [guests, setGuests] = useState<SimGuests>(NO_GUESTS);
  const guestsRef = useRef<SimGuests>(guests);

  useLayoutEffect(() => {
    inputs.current = { parts, project, rig, pose, restDeltas };
  });

  const buildModel = useCallback(
    async (options?: SceneModelOptions): Promise<SimModel> => {
      const vp = viewportRef.current;

      if (!vp) throw new Error('The canvas isn’t ready.');

      await vp.meshesReady();

      const current = inputs.current;
      const [measures, posedFloor] = await Promise.all([
        vp.measureParts(),
        vp.posedFloor(undefined, current.restDeltas),
      ]);

      const input = withGuests(
        {
          parts: current.parts,
          rig: current.rig,
          project: current.project,
          pose: current.pose,
          measures,
          partTriangles: vp.partTriangles,
          posedFloor,
          world: options?.alone ? [] : worldRef.current,
          ...(options?.pin ? { fixedBase: { [options.pin]: true } } : {}),
        },
        options?.alone ? NO_GUESTS : guestsRef.current,
      );

      return buildMjcf(calibratedInput(input, simCalibrations(current.project.servoCalibrations)));
    },
    [viewportRef],
  );

  const setWorldItems = (items: WorldItem[], cast: SimGuests) => {
    worldRef.current = items;
    guestsRef.current = cast;
    setWorldParts(items);
    setGuests(cast);
  };

  return { inputs, buildModel, worldParts, guestParts: guests.parts, setWorldItems };
}

function useStopOnEdit({
  parts,
  joints,
  modelRef,
  stop,
}: {
  parts: ScenePart[];
  joints: ProjectSettings['joints'];
  modelRef: React.RefObject<SimModel | null>;
  stop: () => void;
}) {
  const sceneKey = useRef({ parts, joints });

  useEffect(() => {
    const prev = sceneKey.current;

    sceneKey.current = { parts, joints };

    if (modelRef.current && (prev.parts !== parts || prev.joints !== joints)) stop();
  }, [parts, joints, modelRef, stop]);
}

function useController(send: (msg: SimRequest) => void) {
  const [controller, setControllerState] = useState<Controller>({ kind: 'hold' });
  const setController = useCallback(
    (c: Controller) => {
      setControllerState(c);
      send({ type: 'controller', controller: c });
    },
    [send],
  );

  return [controller, setController] as const;
}

interface SimStartInputs {
  sw: ReturnType<typeof useSimWorker>;
  buildModel: (options?: SceneModelOptions) => Promise<SimModel>;
  modelRef: React.RefObject<SimModel | null>;
  setModel: (m: SimModel) => void;
  controller: Controller;
  speed: number;
}

function useSimStart({ sw, buildModel, modelRef, setModel, controller, speed }: SimStartInputs) {
  const { setError, setStatus, worker, load, setPlaying } = sw;
  const pinned = useRef<string | null>(null);

  const startModel = useCallback(async () => {
    setError(null);
    setStatus('loading');

    let m: SimModel;

    try {
      m = await buildModel({ pin: pinned.current });
    } catch (e) {
      setError(errorMessage(e));
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
  }, [buildModel, worker, load, controller, speed, setError, setStatus, setPlaying, modelRef, setModel]);

  const start = useCallback(() => {
    pinned.current = null;

    return startModel();
  }, [startModel]);

  const startPinned = useCallback(
    (pin: string | null) => {
      pinned.current = pin;

      return startModel();
    },
    [startModel],
  );

  return { start, startPinned, pinned: () => (modelRef.current ? pinned.current : null) };
}

export function useSimulation(props: Inputs): Simulation {
  const { parts, project, rig, pose, viewportRef } = props;
  const [model, setModel] = useState<SimModel | null>(null);
  const [speed, setSpeedState] = useState(1);
  const modelRef = useRef<SimModel | null>(null);
  const { inputs, buildModel, worldParts, guestParts, setWorldItems } = useSceneModel(props);
  const runSeq = useRef(0);
  const sw = useSimWorker(viewportRef, modelRef);
  const { status, setStatus, playing, setPlaying, stats, setStats, error, send, frameHookRef } = sw;
  const [controller, setController] = useController(send);
  const touch = useSimTouches(modelRef, send);
  const watching = useWatch(send, sw.watched);

  const { start, startPinned, pinned } = useSimStart({ sw, buildModel, modelRef, setModel, controller, speed });

  const stop = useCallback(() => {
    send({ type: 'dispose' });
    modelRef.current = null;
    setModel(null);
    setStatus('off');
    setPlaying(false);
    setStats(null);
    viewportRef.current?.setPose(inputs.current.restDeltas);
  }, [viewportRef, send, setModel, setStatus, setPlaying, setStats, inputs]);

  useStopOnEdit({ parts, joints: project.joints, modelRef, stop });

  const runOn = (m: SimModel, opts: RunOptions) => runModel(m, opts, ++runSeq.current);
  const drive = useDrive({
    parts,
    rig,
    pose,
    status,
    stats,
    send,
    viewportRef,
    modelRef,
    frameHookRef,
    startSim: startPinned,
    pinned,
    setController,
    runOn,
    velocity: props.velocity,
  });
  const setWorld = (items: WorldItem[], cast: SimGuests = NO_GUESTS) => {
    setWorldItems(items, cast);
    stop();
  };

  return {
    status,
    playing,
    stats,
    latestStats: sw.latestStats,
    latestScan: sw.latestScan,
    error,
    model,
    modelNow: () => modelRef.current,
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
    buildModel: (options) => buildModel({ alone: options?.alone }),
    ...touch,
    setFault: (joint, kind) => send({ type: 'fault', joint, kind }),
    drive,
    record: () => send({ type: 'record', on: true }),
    stopRecording: sw.stopRecording,
    scrub: (r) => {
      setPlaying(false);

      return sw.scrub(r);
    },
    seek: sw.seek,
    sought: sw.sought,
    worldParts: withLooks(worldParts, sw.worldLooks),
    guestParts,
    subscribePoses: sw.subscribePoses,
    connectCameras: sw.connectCameras,
    setWorld,
    runRoutine: async (input, onUpdate) => {
      await start();

      return sw.startRoutine(input, onUpdate);
    },
    runCase: (input) => send(input ? { type: 'case', ...input } : { type: 'caseEnd' }),
    ...watching,
    input: (name, value) => send({ type: 'input', name, value }),
    world: (change) => send({ type: 'world', change }),
    latestFacts: sw.latestFacts,
    runOn,
    run: async (opts) => {
      const m = await buildModel();

      return runModel(m, opts, ++runSeq.current);
    },
    falls: async (plan) => {
      const m = await buildModel();

      return { model: m, runs: await fallsOn(m, plan, ++runSeq.current) };
    },
  };
}
