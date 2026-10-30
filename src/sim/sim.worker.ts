/// <reference lib="webworker" />
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { SimEngine, type Controller } from './engine';
import type { SimModel } from './mjcf';
import type { RobotPoseState } from '../types/robotics';
import { TorqueRecorder, type TorqueSeries } from '../utils/peakTorque';
import { demandedTorques, limitForces } from './simForces';

export type SimRequest =
  | { type: 'load'; model: SimModel; controller?: Controller }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'reset'; initial?: RobotPoseState }
  | { type: 'speed'; value: number }
  | { type: 'controller'; controller: Controller }
  | { type: 'push'; robot: string; force: [number, number, number]; seconds?: number }
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
    }
  | { type: 'dispose' };

export type SimResponse =
  | { type: 'ready'; version: string; nq: number; nu: number; nbody: number }
  | { type: 'error'; message: string; id?: number }
  | { type: 'frame'; poses: Float64Array; stats: ReturnType<SimEngine['stats']>; playing: boolean }
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
let playing = false;
let speed = 1;
let timer = 0;
let last = 0;
let rtf = 1;

const post = (msg: SimResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);
const frame = () => {
  if (!engine) return;

  const poses = engine.poses();

  post({ type: 'frame', poses, stats: engine.stats(rtf), playing }, [poses.buffer]);
};

function loop() {
  if (!engine || !playing) return;

  const now = performance.now();
  const wall = Math.min((now - last) / 1000, 0.1);

  last = now;

  const t0 = performance.now();

  engine.step(wall * speed);

  const cost = (performance.now() - t0) / 1000;
  const achieved = cost > wall ? (wall * speed * wall) / cost : wall * speed;

  rtf = rtf * 0.9 + (wall > 0 ? achieved / wall : 1) * 0.1;
  frame();
  timer = setTimeout(loop, 16) as unknown as number;
}

function errorText(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);

  return s.replace(/^Error:\s*/, '');
}

type Msg<K extends SimRequest['type']> = Extract<SimRequest, { type: K }>;

async function load(msg: Msg<'load'>) {
  mj ??= await loadMujoco();
  engine?.dispose();
  engine = null;
  playing = false;
  engine = new SimEngine(mj, msg.model);

  if (msg.controller) engine.setController(msg.controller);

  const m = engine.model;

  post({ type: 'ready', version: mj.mj_versionString(), nq: m.nq, nu: m.nu, nbody: m.nbody });
  frame();
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

function tracer(sim: SimEngine) {
  const n = sim.sim.joints.length;
  const recorder = new TorqueRecorder(n, sim.dt);
  const demand = new Float64Array(n);

  return {
    recorder,
    afterStep: () => recorder.add(demandedTorques(sim.model, sim.data, demand), sim.data.actuator_force),
  };
}

function run(msg: Msg<'run'>) {
  if (!engine) throw new Error('Nothing loaded');

  const sim = engine;
  const pushes = [...(msg.pushes ?? [])].sort((a, b) => a.at - b.at);
  const wanted = [...(msg.frames ?? [])].sort((a, b) => a - b);
  const frames: Array<{ t: number; poses: Float64Array }> = [];
  const start = sim.data.time;
  const end = start + msg.seconds;

  if (msg.forceLimits) limitForces(sim.model, sim.sim, msg.forceLimits);

  const trace = msg.trace ? tracer(sim) : null;

  while (sim.data.time < end - 1e-9) {
    const t = sim.data.time - start;

    applyDuePushes(sim, pushes, t);

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
    playing = false;
    clearTimeout(timer);
    frame();
  },
  reset: (msg) => {
    engine?.reset(msg.initial);
    frame();
  },
  speed: (msg) => {
    speed = msg.value;
  },
  controller: (msg) => {
    engine?.setController(msg.controller);
  },
  grab,
  push: (msg) => {
    engine?.pushRobot(msg.robot, msg.force, msg.seconds);
  },
  run,
  dispose: () => {
    playing = false;
    clearTimeout(timer);
    engine?.dispose();
    engine = null;
  },
};

ctx.onmessage = async (ev: MessageEvent<SimRequest>) => {
  const msg = ev.data;

  try {
    await (handlers[msg.type] as (m: SimRequest) => void | Promise<void>)(msg);
  } catch (e) {
    post({ type: 'error', message: errorText(e), id: msg.type === 'run' ? msg.id : undefined });
  }
};
