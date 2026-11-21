/// <reference lib="webworker" />
import { type MainModule } from '@mujoco/mujoco';
import { loadMujoco } from './loadMujoco';
import { frameContacts, Recorder, recordingTransfer, type Recording } from './recorder';
import { effortsTransfer, fitsRecording, recordedEfforts, setRecordedFrame } from './recordedFrames';
import { SimEngine, type Controller } from './engine';
import { commandTimeline, runFor, stepScriptedCase, type ScriptTimeline } from './simRun';
import { LiveRoutine } from '../routines/routineLive';
import { LiveCase } from '../cases/liveCase';
import { LiveWatch } from '../skills/liveWatch';
import { errorMessage } from '../utils/errorMessage';
import { PoseGate } from './poseGate';
import { WorldMoves } from './worldMoves';
import type { WorldChange } from '../cases/worldSet';
import { runFalls } from './fallRuns';
import { LivePhysics } from './livePhysics';
import { sha256Hex } from '../skills/hash';
import { ContinuationSession } from './continuationSession';
import type { SimRequest, SimResponse } from './simMessages';

export type { SimRequest, SimResponse } from './simMessages';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: MainModule | null = null;
let engine: SimEngine | null = null;
let loadGeneration = 0;
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
let script: ScriptTimeline | null = null;
let scanShown = -1;
const poseGate = new PoseGate();
const livePhysics = new LivePhysics();
const continuation = new ContinuationSession();
const currentRecorder = () => recorder ?? continuation.recorderNow();

const post = (msg: SimResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);
const frame = (force = false, recordedContacts?: Int32Array) => {
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

  const physics = livePhysics.applied();
  const contacts = recordedContacts ?? engine.contactPairs();

  post(
    {
      type: 'frame',
      poses,
      joints,
      contacts,
      stats: engine.stats(rtf),
      playing,
      facts,
      physics,
      ...(scan ? { scan } : {}),
    },
    [poses.buffer, joints.buffer, contacts.buffer, ...(scan ? [scan.values.buffer, scan.points.buffer] : [])],
  );
};

function postLooks() {
  if (!world || world.looksVersion === looksShown) return;

  looksShown = world.looksVersion;
  post({ type: 'world', looks: world.looks() });
}

function changeWorld(change: WorldChange) {
  if (!engine || !world || world.apply(change)) return;

  currentRecorder()?.worldChange(change);
  postLooks();
  frame();
}

function loop() {
  if (!engine || !playing) return;

  const now = performance.now();
  const wall = Math.min((now - last) / 1000, 0.1);

  last = now;

  const t0 = performance.now();
  const seconds = Math.min(wall * speed, continuation.remaining() ?? Infinity);

  if ((continuation.remaining() ?? Infinity) <= 1e-9) {
    halt();
    frame();

    return;
  }

  if (script && !liveCase) script.commands.advance(engine.data.time - script.start);

  if (live) advanceRoutine(live, seconds);
  else if (liveCase) stepScriptedCase(engine, liveCase, script, seconds);
  else if (watching) watching.advance(seconds);
  else engine.step(seconds);

  const cost = (performance.now() - t0) / 1000;
  const achieved = cost > wall ? (wall * speed * wall) / cost : wall * speed;

  rtf = rtf * 0.9 + (wall > 0 ? achieved / wall : 1) * 0.1;
  postLooks();
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
  continuation.select(null);
  recorder?.invalidateContinuation();
  mj ??= await loadMujoco();

  if (!engine) throw new Error('Nothing loaded');

  live = await LiveRoutine.start(mj, engine, msg);
  play();
}

async function startCase(msg: Msg<'case'>) {
  if (!engine) throw new Error('Nothing loaded');

  liveCase = await LiveCase.start(engine, msg, () => driveController);
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
  continuation.select(null);
  recorder?.invalidateContinuation();
  mj ??= await loadMujoco();
  watching = null;

  if (!engine || !msg.watch) return;

  const onMargin = (id: number, margin: number) => post({ type: 'watched', id, margin });

  watching = new LiveWatch({ mj, engine, input: msg.watch, onMargin });
  frame();
}

async function load(msg: Msg<'load'>) {
  const generation = ++loadGeneration;

  mj ??= await loadMujoco();

  if (generation !== loadGeneration) return;

  continuation.select(null);
  engine?.dispose();
  recorder?.invalidateContinuation();
  engine = null;
  live = null;
  watching = null;
  scrubbed = null;
  liveCase = null;
  script = null;
  playing = false;
  engine = new SimEngine(livePhysics.module(mj), msg.model);
  livePhysics.attach(engine);
  world = new WorldMoves(mj, engine);
  looksShown = -1;
  post({ type: 'world', looks: {} });
  scanShown = -1;
  poseGate.reset();

  if (msg.controller) setController(msg.controller);

  const m = engine.model;

  frame();
  post({ type: 'ready', nq: m.nq, nu: m.nu, nbody: m.nbody, loadId: msg.loadId });
}

function record(msg: Msg<'record'>) {
  if (!engine) return;

  if (msg.on) {
    continuation.select(null);

    const source = script && !live && !watching ? liveCase?.continuationSource() : null;
    const checkpoints =
      source && world
        ? {
            caseHash: sha256Hex(JSON.stringify(source)),
            seconds: source.task.seconds,
            deadline: liveCase?.continuationDeadline,
            world,
            physics: () => livePhysics.snapshot(),
          }
        : undefined;

    recorder = new Recorder(engine, driveController, world, checkpoints);
    engine.stepHook = recorder.hook;
    engine.commandHook = recorder.command;
    engine.continuationHook = recorder.continuationHook;

    return;
  }

  const recording = continuation.finish() ?? recorder?.finish() ?? null;

  engine.stepHook = null;
  engine.commandHook = null;
  engine.continuationHook = null;
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

  const efforts = engine && scrubbed ? (msg.efforts ?? recordedEfforts(mj, engine, scrubbed)) : null;

  const selection = continuation.select(scrubbed);

  post({ type: 'scrubbed', efforts, selection, checkpoints: continuation.points() }, effortsTransfer(efforts));
}

function seek(msg: Msg<'seek'>) {
  if (!engine || !mj || !scrubbed) return;

  halt();

  const frameAt = setRecordedFrame(mj, engine, scrubbed, msg.frame);
  const qpos = Float64Array.from(engine.data.qpos);

  world?.replay(scrubbed.world ?? [], frameAt * scrubbed.dt);
  postLooks();
  frame(false, frameContacts(scrubbed, frameAt).slice());
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

function run(msg: Msg<'run'>) {
  if (!engine) throw new Error('Nothing loaded');

  post({ type: 'ran', ...runFor(engine, msg) });
}

const handlers: { [K in SimRequest['type']]: (msg: Msg<K>) => void | Promise<void> } = {
  load,
  play,
  pause: () => {
    halt();
    frame();
  },
  reset: (msg) => {
    continuation.select(null);
    recorder?.invalidateContinuation();
    engine?.reset(msg.initial);
    world?.reset();
    postLooks();
    frame();
  },
  speed: (msg) => {
    speed = msg.value;
  },
  controller: (msg) => {
    recorder?.invalidateContinuation();
    script = null;
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
    script = engine ? { start: engine.data.time, commands: commandTimeline(engine, msg.commands) } : null;
  },
  respawn: (msg) => {
    continuation.select(null);
    recorder?.invalidateContinuation();
    engine?.respawn(msg.robot);
    frame();
  },
  fault: (msg) => {
    engine?.setFault(msg.joint, msg.kind);
    currentRecorder()?.fault(msg.joint, msg.kind);
    frame();
  },
  record,
  scrub,
  seek,
  branch: (msg) => {
    halt();

    if (recorder || live || watching) return post({ type: 'branched', id: msg.id, result: null });

    const result = engine && world ? continuation.start({ ...msg, engine, world, physics: livePhysics }) : null;

    if (result) {
      script = null;
      liveCase = scrubbed ? LiveCase.resume(engine!, { kase: msg.kase, recording: scrubbed, ...result }) : null;
      scrubbed = null;
      driveController = result.controller;
      postLooks();
      frame(true);
    }

    post({ type: 'branched', id: msg.id, result });
  },
  run,
  falls: (msg) => {
    if (!mj || !engine) throw new Error('Nothing loaded');

    post({ type: 'fell', id: msg.id, runs: runFalls(mj, engine, msg) });
  },
  routine: startRoutine,
  vision: (msg) => {
    live?.acceptVision(msg.result, msg.ageMs);
    liveCase?.acceptVision(msg.result, msg.ageMs);
  },
  case: startCase,
  caseEnd: () => {
    liveCase = null;
  },
  watch,
  input: (msg) => {
    liveCase?.input(msg.name, msg.value);
    currentRecorder()?.input(msg.name, msg.value);
  },
  world: (msg) => changeWorld(msg.change),
  physics: (msg) => {
    continuation.select(null);
    recorder?.invalidateContinuation();

    if (mj) livePhysics.apply(mj, msg.physics);

    frame(true);
  },
  cameras: (msg) => {
    cameraPort?.close();
    cameraPort = msg.port;
    frame(true);
  },
  dispose: () => {
    continuation.select(null);
    loadGeneration++;
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
    post({
      type: 'error',
      message: errorText(e),
      id: msg.type === 'run' || msg.type === 'falls' ? msg.id : undefined,
      loadId: msg.type === 'load' ? msg.loadId : undefined,
    });
  }
};
