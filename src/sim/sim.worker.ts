/// <reference lib="webworker" />
import type { MainModule } from '@mujoco/mujoco';
import { loadMujoco } from './loadMujoco';
import { frameContacts, type Recorder, type Recording } from './recorder';
import { effortsTransfer, fitsRecording, recordedEfforts, setRecordedFrame } from './recordedFrames';
import { SimEngine, type Controller } from './engine';
import { commandTimeline, runFor, stepScriptedCase, type ScriptTimeline } from './simRun';
import { LiveRoutine } from '../routines/routineLive';
import { LiveCase } from '../cases/liveCase';
import { LiveWatch } from '../skills/liveWatch';
import { errorMessage } from '../utils/errorMessage';
import { PoseGate } from './poseGate';
import type { WorldMoves } from './worldMoves';
import type { WorldChange } from '../cases/worldSet';
import { runFalls } from './fallRuns';
import { LivePhysics } from './livePhysics';
import { liveGrab } from './liveGrab';
import { liveRecorder, sendRecording } from './liveRecorder';
import { ContinuationSession } from './continuationSession';
import { LiveTeaching, handleTeaching } from './liveTeaching';
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
const teachingSession = new LiveTeaching();
let teachingRecordId: number | null = null;
const completedTeaching = new Set<number>();
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
  const seconds = teachingSession.seconds(engine, Math.min(wall * speed, continuation.remaining() ?? Infinity));

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

  if (teachingSession.expired(engine)) {
    halt();
    finishTeaching();
  }

  frame();

  if (playing) timer = setTimeout(loop, 16) as unknown as number;
}

function advanceRoutine(routine: LiveRoutine, seconds: number) {
  const update = routine.advance(seconds);

  post({ type: 'routine', ...update });

  if (!update.done) return;

  live = null;
  playing = false;
}

async function startRoutine(msg: Msg<'routine'>) {
  finishTeaching();
  continuation.select(null);
  recorder?.invalidateContinuation();
  mj ??= await loadMujoco();

  if (!engine) throw new Error('Nothing loaded');

  live = await LiveRoutine.start(mj, engine, msg);
  play();
}

async function startCase(msg: Msg<'case'>) {
  finishTeaching();

  if (!engine) throw new Error('Nothing loaded');

  liveCase = await LiveCase.start(engine, msg, () => driveController);
}

function setController(c: Controller) {
  driveController = c;

  if (liveCase && !liveCase.driving) return;

  engine?.setController(c);
}

const errorText = (e: unknown) => errorMessage(e).replace(/^Error:\s*/, '');

type Msg<K extends SimRequest['type']> = Extract<SimRequest, { type: K }>;

function teaching(msg: Msg<'teaching'>) {
  return handleTeaching({
    engine,
    msg,
    session: teachingSession,
    recording: !!currentRecorder() || !!live || !!watching,
    start: startTeachingCase,
    post,
  });
}

function startTeachingCase(value: LiveCase, msg: Msg<'teaching'> & { phase: 'start' }) {
  liveCase = value;
  driveController = msg.controller;
  script = null;
  record({ type: 'record', on: true });
  teachingRecordId = msg.id;
  play();
}

async function watch(msg: Msg<'watch'>) {
  finishTeaching();
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

  finishTeaching();
  continuation.select(null);
  recorder?.invalidateContinuation();
  engine?.dispose();
  teachingSession.reset();
  engine = null;
  live = null;
  watching = null;
  scrubbed = null;
  liveCase = null;
  script = null;
  playing = false;
  engine = new SimEngine(livePhysics.module(mj), msg.model);
  livePhysics.attach(engine);
  world = engine.world;
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
  if (msg.recordId !== undefined && completedTeaching.has(msg.recordId)) return;

  if (msg.recordId !== undefined && msg.recordId !== teachingRecordId) {
    post({ type: 'recorded', recording: null, recordId: msg.recordId });

    return;
  }

  if (!engine) return;

  if (msg.on) return startRecording(engine);

  const recording = continuation.finish() ?? recorder?.finish() ?? null;
  const recordId = teachingRecordId ?? undefined;

  if (recordId !== undefined) completedTeaching.add(recordId);

  teachingRecordId = null;
  engine.stepHook = null;
  engine.commandHook = null;
  engine.continuationHook = null;
  engine.controlHook = null;
  recorder = null;
  teachingSession.reset();
  sendRecording(post, recording, recordId);
}

function startRecording(target: SimEngine) {
  if (recorder) return;

  continuation.select(null);

  recorder = liveRecorder({
    engine: target,
    controller: driveController,
    world,
    kase: script && !live && !watching ? liveCase : null,
    physics: () => livePhysics.snapshot(),
  });
}

function finishTeaching() {
  if (teachingRecordId !== null) record({ type: 'record', on: false, recordId: teachingRecordId });
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

  const frameAt = Math.max(0, Math.min(scrubbed.frames - 1, Math.round(msg.frame)));

  world?.replay(scrubbed.world ?? [], frameAt * scrubbed.dt);
  setRecordedFrame(mj, engine, scrubbed, frameAt);

  const qpos = Float64Array.from(engine.data.qpos);

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

function run(msg: Msg<'run'>) {
  if (!engine) throw new Error('Nothing loaded');

  post({ type: 'ran', ...runFor(engine, msg) });
}

const handlers: { [K in SimRequest['type']]: (msg: Msg<K>) => void | Promise<void> } = {
  teaching,
  load,
  play,
  pause: () => {
    halt();
    frame();
  },
  reset: (msg) => {
    continuation.select(null);
    recorder?.invalidateContinuation();
    finishTeaching();
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
    finishTeaching();
    script = null;
    setController(msg.controller);
  },
  grab: (msg) => liveGrab(engine, msg),
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
    finishTeaching();
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
    finishTeaching();
    teachingSession.reset();
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
    post({ type: 'disposed' });
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
