/// <reference lib="webworker" />
import { type MainModule } from '@mujoco/mujoco';
import { loadMujoco } from './loadMujoco';
import type { DriveCommand } from './driveTypes';
import { Recorder, recordingTransfer, type Recording } from './recorder';
import { fitsRecording, recordedEfforts, setRecordedFrame } from './recordedFrames';
import type { Scan } from './scanner';
import { SimEngine, type Controller } from './engine';
import { ConditionedPhysics, type LiveConditions } from './conditions';
import type { FaultKind } from './faults';
import type { SimModel } from './mjcf';
import type { RobotPoseState } from '../types/robotics';
import { TorqueRecorder, type TorqueSeries } from '../utils/peakTorque';
import type { AmpModel } from '../utils/servoAmps';
import { demandedTorques, jointForces, jointSpeeds, limitForces } from './simForces';
import { LiveRoutine, type LiveRoutineInput, type LiveUpdate } from '../routines/routineLive';
import { LiveCase, type LiveCaseInput } from '../cases/liveCase';
import type { CaseFacts, FactValue } from '../cases/caseFacts';
import { LiveWatch, type WatchInput } from '../skills/liveWatch';
import { errorMessage } from '../utils/errorMessage';
import { PoseGate } from './poseGate';
import { WorldMoves } from './worldMoves';
import type { WorldChange, WorldLooks } from '../cases/worldSet';
import { runFalls, type FallPlan, type FallRun } from './fallRuns';

export type SimRequest =
  | { type: 'load'; model: SimModel; controller?: Controller }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'reset'; initial?: RobotPoseState }
  | { type: 'speed'; value: number }
  | { type: 'controller'; controller: Controller; conditions?: LiveConditions }
  | { type: 'push'; robot: string; force: [number, number, number]; seconds?: number; releaseDeg?: number }
  | ({ type: 'command' } & DriveCommand)
  | { type: 'script'; commands: Array<{ at: number; command: DriveCommand }> }
  | { type: 'respawn'; robot?: string }
  | { type: 'fault'; joint: string; kind: FaultKind | null }
  | { type: 'record'; on: boolean }
  | { type: 'scrub'; recording: Recording | null }
  | { type: 'seek'; frame: number }
  | { type: 'grab'; phase: 'start'; body: number; point: [number, number, number] }
  | { type: 'grab'; phase: 'move'; point: [number, number, number]; turn: [number, number, number, number] | null }
  | { type: 'grab'; phase: 'end' }
  | {
      type: 'run';
      id: number;
      seconds: number;
      pushes?: Array<{ at: number; robot: string; force: [number, number, number] }>;
      frames?: number[];
      forceLimits?: Record<string, number>;
      trace?: boolean;
      currents?: Record<string, AmpModel>;
      commands?: Array<{ at: number; command: DriveCommand }>;
    }
  | ({ type: 'falls'; id: number } & FallPlan)
  | ({ type: 'routine' } & LiveRoutineInput)
  | ({ type: 'case' } & LiveCaseInput)
  | { type: 'caseEnd' }
  | { type: 'watch'; watch: WatchInput | null }
  | { type: 'input'; name: string; value: FactValue }
  | { type: 'world'; change: WorldChange }
  | { type: 'cameras'; port: MessagePort | null }
  | { type: 'dispose' };

export type SimResponse =
  | ({ type: 'routine' } & LiveUpdate)
  | { type: 'ready'; nq: number; nu: number; nbody: number }
  | { type: 'error'; message: string; id?: number }
  | { type: 'recorded'; recording: Recording | null }
  | { type: 'scrubbed'; efforts: Float32Array[] | null }
  | { type: 'sought'; frame: number; qpos: Float64Array }
  | { type: 'world'; looks: WorldLooks }
  | { type: 'watched'; id: number; margin: number }
  | {
      type: 'frame';
      poses: Float64Array;
      joints: Float64Array;
      stats: ReturnType<SimEngine['stats']>;
      playing: boolean;
      facts?: CaseFacts;
      scan?: Scan;
    }
  | { type: 'fell'; id: number; runs: FallRun[] }
  | {
      type: 'ran';
      id: number;
      stats: ReturnType<SimEngine['stats']>;
      frames: Array<{ t: number; poses: Float64Array }>;
      trace?: TorqueSeries;
    };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: MainModule | null = null;
let engine: SimEngine | null = null;
let physics: ConditionedPhysics | null = null;
let world: WorldMoves | null = null;
let looksShown = -1;
let playing = false;
let speed = 1;
let timer = 0;
let last = 0;
let rtf = 1;
let recorder: Recorder | null = null;
let scrubbed: Recording | null = null;
let live: LiveRoutine | null = null;
let liveCase: LiveCase | null = null;
let watching: LiveWatch | null = null;
let driveController: Controller = { kind: 'hold' };
let cameraPort: MessagePort | null = null;
let script: { start: number; commands: Array<{ at: number; command: DriveCommand }> } | null = null;
let scanShown = -1;
const poseGate = new PoseGate();

const post = (msg: SimResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);
const frame = (force = false) => {
  if (!engine) return;

  const poses = engine.poses();
  const joints = engine.jointStates();
  const moved = poseGate.moved(poses) || force;

  if (cameraPort && moved) {
    const copy = poses.slice();

    cameraPort.postMessage(copy, [copy.buffer]);
  }

  const facts = liveCase?.facts;
  const scanner = engine.scanner;
  const scan = scanner && scanner.version !== scanShown ? scanner.latest() : undefined;

  scanShown = scanner?.version ?? -1;

  const stats = physics?.conditioned
    ? { ...engine.stats(rtf), conditions: physics.reading(engine.model) }
    : engine.stats(rtf);

  post({ type: 'frame', poses, joints, stats, playing, facts, ...(scan ? { scan } : {}) }, [
    poses.buffer,
    joints.buffer,
    ...(scan ? [scan.values.buffer, scan.points.buffer] : []),
  ]);
};

function postLooks() {
  if (!world || world.looksVersion === looksShown) return;

  looksShown = world.looksVersion;
  post({ type: 'world', looks: world.looks() });
}

function changeWorld(change: WorldChange) {
  if (!engine || !world || world.apply(change)) return;

  recorder?.worldChange(change);
  postLooks();
  frame();
}

function loop() {
  if (!engine || !playing) return;

  const now = performance.now();
  const wall = Math.min((now - last) / 1000, 0.1);

  last = now;

  const t0 = performance.now();

  if (script) applyDueCommands(engine, script.commands, engine.data.time - script.start);

  if (live) advanceRoutine(live, wall * speed);
  else if (liveCase) liveCase.advance(wall * speed);
  else if (watching) watching.advance(wall * speed);
  else engine.step(wall * speed);

  const cost = (performance.now() - t0) / 1000;
  const achieved = cost > wall ? (wall * speed * wall) / cost : wall * speed;

  rtf = rtf * 0.9 + (wall > 0 ? achieved / wall : 1) * 0.1;
  frame();
  timer = setTimeout(loop, 16) as unknown as number;
}

function advanceRoutine(routine: LiveRoutine, seconds: number) {
  const update = routine.advance(seconds);

  post({ type: 'routine', ...update });

  if (!update.done) return;

  live = null;
  playing = false;
}

async function startRoutine(msg: Msg<'routine'>) {
  mj ??= await loadMujoco();

  if (!engine) throw new Error('Nothing loaded');

  setConditions(null);

  live = await LiveRoutine.start(mj, engine, msg);
  play();
}

async function startCase(msg: Msg<'case'>) {
  if (!engine) throw new Error('Nothing loaded');

  setConditions(null);

  liveCase = await LiveCase.start(engine, msg, () => driveController);
}

function setConditions(conditions: LiveConditions | null) {
  if (engine && physics?.set(engine.model, engine.data, conditions)) frame();
}

function setController(c: Controller) {
  driveController = c;

  if (liveCase && !liveCase.driving) return;

  engine?.setController(c);
}

function errorText(e: unknown): string {
  const s = errorMessage(e);

  return s.replace(/^Error:\s*/, '');
}

type Msg<K extends SimRequest['type']> = Extract<SimRequest, { type: K }>;

async function watch(msg: Msg<'watch'>) {
  mj ??= await loadMujoco();
  watching = null;
  setConditions(null);

  if (!engine || !msg.watch) return;

  const onMargin = (id: number, margin: number) => post({ type: 'watched', id, margin });

  watching = new LiveWatch({ mj, engine, input: msg.watch, onMargin });
  frame();
}

async function load(msg: Msg<'load'>) {
  mj ??= await loadMujoco();
  engine?.dispose();
  engine = null;
  live = null;
  watching = null;
  scrubbed = null;
  liveCase = null;
  script = null;
  playing = false;
  physics = new ConditionedPhysics(mj);
  engine = new SimEngine(physics.module, msg.model);
  physics.attach(engine.model);
  world = new WorldMoves(mj, engine);
  looksShown = -1;
  post({ type: 'world', looks: {} });
  scanShown = -1;
  poseGate.reset();

  if (msg.controller) setController(msg.controller);

  const m = engine.model;

  post({ type: 'ready', nq: m.nq, nu: m.nu, nbody: m.nbody });
  frame();
}

function record(msg: Msg<'record'>) {
  if (!engine) return;

  if (msg.on) {
    recorder = new Recorder(engine, driveController, world);
    engine.stepHook = recorder.hook;
    engine.commandHook = recorder.command;

    return;
  }

  const recording = recorder?.finish() ?? null;

  engine.stepHook = null;
  engine.commandHook = null;
  recorder = null;
  post({ type: 'recorded', recording }, recording ? recordingTransfer(recording) : []);
}

function halt() {
  playing = false;
  clearTimeout(timer);
}

async function scrub(msg: Msg<'scrub'>) {
  mj ??= await loadMujoco();
  halt();
  scrubbed = engine && msg.recording && fitsRecording(engine, msg.recording) ? msg.recording : null;

  const efforts = engine && scrubbed ? recordedEfforts(mj, engine, scrubbed) : null;

  post({ type: 'scrubbed', efforts }, efforts?.map((e) => e.buffer) ?? []);
}

function seek(msg: Msg<'seek'>) {
  if (!engine || !mj || !scrubbed) return;

  halt();

  const frameAt = setRecordedFrame(mj, engine, scrubbed, msg.frame);
  const qpos = Float64Array.from(engine.data.qpos);

  world?.replay(scrubbed.world ?? [], frameAt * scrubbed.dt);
  postLooks();
  frame();
  post({ type: 'sought', frame: frameAt, qpos }, [qpos.buffer]);
}

function play() {
  if (!engine || playing) return;

  playing = true;
  last = performance.now();
  loop();
}

function grab(msg: Msg<'grab'>) {
  if (msg.phase === 'start') engine?.grabStart(msg.body, msg.point);
  else if (msg.phase === 'move') engine?.grabMove(msg.point, msg.turn);
  else engine?.grabEnd();
}

function applyDuePushes(sim: SimEngine, pushes: NonNullable<Msg<'run'>['pushes']>, t: number) {
  while (pushes.length && pushes[0].at <= t + 1e-9) {
    const p = pushes.shift()!;

    sim.pushRobot(p.robot, p.force);
  }
}

function applyDueCommands(sim: SimEngine, commands: NonNullable<Msg<'run'>['commands']>, t: number) {
  while (commands.length && commands[0].at <= t + 1e-9) sim.command(commands.shift()!.command);
}

function tracer(sim: SimEngine, currents: Record<string, AmpModel> = {}) {
  const n = sim.sim.joints.length;
  const recorder = new TorqueRecorder(n, sim.dt, { amps: sim.sim.joints.map((j) => currents[j.id] ?? null) });
  const demand = new Float64Array(n);
  const actual = new Float64Array(n);
  const speed = new Float64Array(n);

  return {
    recorder,
    afterStep: () =>
      recorder.add(
        demandedTorques(sim.model, sim.data, sim.sim.joints, demand),
        jointForces(sim.data, sim.sim.joints, actual),
        jointSpeeds(sim.data, sim.sim.joints, speed),
      ),
  };
}

function run(msg: Msg<'run'>) {
  if (!engine) throw new Error('Nothing loaded');

  const sim = engine;
  const pushes = [...(msg.pushes ?? [])].sort((a, b) => a.at - b.at);
  const commands = [...(msg.commands ?? [])].sort((a, b) => a.at - b.at);
  const wanted = [...(msg.frames ?? [])].sort((a, b) => a - b);
  const frames: Array<{ t: number; poses: Float64Array }> = [];
  const start = sim.data.time;
  const end = start + msg.seconds;

  if (msg.forceLimits) limitForces(sim.model, sim.sim, msg.forceLimits);

  const trace = msg.trace ? tracer(sim, msg.currents) : null;

  while (sim.data.time < end - 1e-9) {
    const t = sim.data.time - start;

    applyDuePushes(sim, pushes, t);
    applyDueCommands(sim, commands, t);

    while (wanted.length && wanted[0] <= t + 1e-9) frames.push({ t: wanted.shift()!, poses: sim.poses() });

    sim.step(Math.min(0.02, end - sim.data.time), trace?.afterStep);
  }

  if (wanted.length) frames.push({ t: msg.seconds, poses: sim.poses() });

  post({ type: 'ran', id: msg.id, stats: sim.stats(), frames, trace: trace?.recorder.series() });
}

const handlers: { [K in SimRequest['type']]: (msg: Msg<K>) => void | Promise<void> } = {
  load,
  play,
  pause: () => {
    halt();
    frame();
  },
  reset: (msg) => {
    physics?.clearDelay();
    engine?.reset(msg.initial);
    world?.reset();
    postLooks();
    frame();
  },
  speed: (msg) => {
    speed = msg.value;
  },
  controller: (msg) => {
    script = null;
    setConditions(msg.conditions ?? null);
    setController(msg.controller);
  },
  grab,
  push: (msg) => {
    engine?.pushRobot(msg.robot, msg.force, { seconds: msg.seconds, releaseDeg: msg.releaseDeg });
  },
  command: ({ slot, v, target, aux, joints }) => {
    if (slot || !liveCase || liveCase.driving) engine?.command({ slot, v, target, aux, joints });
  },
  script: (msg) => {
    script = engine ? { start: engine.data.time, commands: [...msg.commands].sort((a, b) => a.at - b.at) } : null;
  },
  respawn: (msg) => {
    engine?.respawn(msg.robot);
    frame();
  },
  fault: (msg) => {
    engine?.setFault(msg.joint, msg.kind);
    recorder?.fault(msg.joint, msg.kind);
    frame();
  },
  record,
  scrub,
  seek,
  run,
  falls: (msg) => {
    if (!mj || !engine) throw new Error('Nothing loaded');

    post({ type: 'fell', id: msg.id, runs: runFalls(mj, engine, msg) });
  },
  routine: startRoutine,
  case: startCase,
  caseEnd: () => {
    liveCase = null;
  },
  watch,
  input: (msg) => liveCase?.input(msg.name, msg.value),
  world: (msg) => changeWorld(msg.change),
  cameras: (msg) => {
    cameraPort?.close();
    cameraPort = msg.port;
    frame(true);
  },
  dispose: () => {
    playing = false;
    live = null;
    watching = null;
    liveCase = null;
    recorder = null;
    scrubbed = null;
    clearTimeout(timer);
    engine?.dispose();
    engine = null;
    world = null;
  },
};

ctx.onmessage = async (ev: MessageEvent<SimRequest>) => {
  const msg = ev.data;

  try {
    await (handlers[msg.type] as (m: SimRequest) => void | Promise<void>)(msg);
  } catch (e) {
    post({ type: 'error', message: errorText(e), id: msg.type === 'run' || msg.type === 'falls' ? msg.id : undefined });
  }
};
