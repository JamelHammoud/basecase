import { useSimRuns } from './useSimRuns';
import { useSimController } from './useSimController';
import { useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ProjectSettings, RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { DriveCommand } from './driveTypes';
import type { Controller, SimStats } from './engine';
import type { FaultKind } from './faults';
import type { SimPhysics } from './livePhysics';
import type { SimModel, WorldItem } from './mjcf';
import type { TorqueSeries } from '../utils/peakTorque';
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
import { useSimStart } from './useSimStart';
import { useSimTouches } from './useSimTouches';
import type { CalibrationHistory } from '../reality/history';
import { useSimWorker, type CameraLink, type SimFrameMessage } from './useSimWorker';
import type { Sought } from './useRecordingLink';
import { NO_GUESTS, type SimGuests } from './simGuests';
import { useContactSettings, useSceneModel, useStopOnEdit } from './useSceneModel';
import type { AmpModel } from '../utils/servoAmps';
import type { FallPlan, FallRun } from './fallRuns';
import type { SelfContactSetting, SelfContactSettings } from './selfContact';

export { fallsOn } from './useSimRuns';

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
  selfContact: SelfContactSettings;
  configureSelfContact: (robot: string, setting: SelfContactSetting) => void;
  status: SimStatus;
  playing: boolean;
  stats: SimStats | null;
  latestStats: () => SimStats | null;
  latestScan: () => Scan | null;
  latestPhysics: () => SimPhysics | null;
  latestContacts: () => Int32Array | null;
  error: string | null;
  model: SimModel | null;
  modelNow: () => SimModel | null;
  speed: number;
  controller: Controller;
  start: (model?: SimModel) => Promise<void>;
  play: () => void;
  pause: () => void;
  reset: () => void;
  stop: () => void;
  subscribeStop: (listen: () => void) => () => void;
  setSpeed: (s: number) => void;
  setController: (c: Controller) => void;
  grab: (
    partIds: string[],
    hand: { position: THREE.Vector3; turn: THREE.Quaternion | null } | null,
    phase: 'start' | 'move' | 'end',
  ) => void;
  push: (robot?: string, fallDeg?: number) => void;
  setFault: (jointId: string, kind: FaultKind | null) => void;
  setPhysics: (physics: SimPhysics | null) => void;
  resetTo: (pose: RobotPoseState) => void;
  drive: SimDrive;
  record: () => void;
  stopRecording: () => Promise<Recording | null>;
  scrub: (r: Recording | null, efforts?: RecordedEfforts) => Promise<RecordedEfforts | null>;
  seek: (frame: number) => void;
  sought: () => Sought | null;
  worldParts: WorldItem[];
  worldNow: () => { items: WorldItem[]; guests: SimGuests };
  guestParts: ScenePart[];
  subscribePoses: (listen: (poses: Float64Array, frame: SimFrameMessage) => void) => () => void;
  connectCameras: (link: CameraLink | null) => void;
  setWorld: (items: WorldItem[], guests?: SimGuests) => void;
  buildModel: (options?: SceneModelOptions) => Promise<SimModel>;
  runRoutine: (
    input: LiveRoutineInput,
    onUpdate: (update: LiveUpdate) => void,
    current?: () => boolean,
  ) => Promise<boolean>;
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

export interface SimInputs {
  onSelfContact?: (settings: SelfContactSettings) => ProjectSettings;
  parts: ScenePart[];
  project: ProjectSettings;
  rig: Rig;
  pose: RobotPoseState | undefined;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  restDeltas: Map<string, THREE.Matrix4>;
  velocity?: React.RefObject<VelocitySource | null>;
}

export type RunOptions = Parameters<Simulation['run']>[0];

export interface SceneModelOptions {
  signal?: AbortSignal;
  alone?: boolean;
  pin?: string | null;
  calibrations?: Record<string, CalibrationHistory>;
  withoutBody?: boolean;
}

export function useSimulation(props: SimInputs): Simulation {
  const { parts, project, rig, pose, viewportRef } = props;
  const [model, setModel] = useState<SimModel | null>(null);
  const [speed, setSpeedState] = useState(1);
  const modelRef = useRef<SimModel | null>(null);
  const { inputsRef, buildModel, worldParts, guestParts, setWorldItems, worldNow, cancelPreparation } =
    useSceneModel(props);
  const sw = useSimWorker(viewportRef, modelRef);
  const { status, setStatus, playing, setPlaying, stats, setStats, error, send, frameHookRef } = sw;
  const [controller, setController] = useSimController(send);
  const touch = useSimTouches(modelRef, send);
  const watching = useWatch(send, sw.watched);

  const { start, startGuarded, startPinned, pinned, cancelStart, subscribeStop } = useSimStart({
    sw,
    buildModel,
    modelRef,
    setModel,
    controller,
    speed,
  });

  const stop = useCallback(() => {
    cancelPreparation();
    cancelStart();
    send({ type: 'dispose' });
    modelRef.current = null;
    setModel(null);
    setStatus('off');
    setPlaying(false);
    setStats(null);
    viewportRef.current?.setPose(inputsRef.current.restDeltas);
  }, [viewportRef, send, setModel, setStatus, setPlaying, setStats, inputsRef, cancelStart, cancelPreparation]);

  const noteContactEdit = useStopOnEdit({
    parts,
    joints: project.joints,
    selfContact: project.selfContact,
    modelRef,
    stop,
  });

  const jobs = useSimRuns(buildModel);
  const contactSettings = useContactSettings({ input: props, inputsRef, stop, noteContactEdit });
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
    runOn: jobs.runOn,
    velocity: props.velocity,
  });
  const setWorld = (items: WorldItem[], cast: SimGuests = NO_GUESTS) => {
    setWorldItems(items, cast);
    stop();
  };

  return {
    ...contactSettings,
    status,
    playing,
    stats,
    latestStats: sw.latestStats,
    latestScan: sw.latestScan,
    latestPhysics: sw.latestPhysics,
    latestContacts: sw.latestContacts,
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
    subscribeStop,
    setSpeed: (s) => {
      setSpeedState(s);
      send({ type: 'speed', value: s });
    },
    setController,
    buildModel,
    ...touch,
    setFault: (joint, kind) => send({ type: 'fault', joint, kind }),
    setPhysics: (physics) => send({ type: 'physics', physics }),
    resetTo: (initial) => send({ type: 'reset', initial }),
    drive: stoppedDrive(drive, cancelStart),
    record: () => send({ type: 'record', on: true }),
    stopRecording: sw.stopRecording,
    scrub: (r, efforts) => {
      setPlaying(false);

      return sw.scrub(r, efforts);
    },
    seek: sw.seek,
    sought: sw.sought,
    worldParts: withLooks(worldParts, sw.worldLooks),
    worldNow,
    guestParts,
    subscribePoses: sw.subscribePoses,
    connectCameras: sw.connectCameras,
    setWorld,
    runRoutine: async (input, onUpdate, current = () => true) => {
      const started = await startGuarded(current);

      return started && current() && sw.startRoutine(input, onUpdate);
    },
    runCase: (input) => send(input ? { type: 'case', ...input } : { type: 'caseEnd' }),
    ...watching,
    input: (name, value) => send({ type: 'input', name, value }),
    world: (change) => send({ type: 'world', change }),
    latestFacts: sw.latestFacts,
    ...jobs,
  };
}

function stoppedDrive(drive: SimDrive, cancel: () => void): SimDrive {
  return {
    ...drive,
    stop: () => {
      cancel();
      drive.stop();
    },
  };
}
