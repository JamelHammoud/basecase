/// <reference lib="webworker" />
/**
 * The simulation thread: MuJoCo runs here so physics never stalls the canvas. It steps in real
 * time (× speed) and posts body poses and stats each frame; `run` steps as fast as it can and
 * replies with the result (agent checks).
 */
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { SimEngine, type Controller } from './engine';
import type { SimModel } from './mjcf';
import type { RobotPoseState } from '../types/robotics';

export type SimRequest =
  | { type: 'load'; model: SimModel; controller?: Controller }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'reset'; initial?: RobotPoseState }
  | { type: 'speed'; value: number }
  | { type: 'controller'; controller: Controller }
  | { type: 'push'; robot: string; force: [number, number, number]; seconds?: number }
  /** Canvas gizmo as a hand (MuJoCo frame): grab a body at a point, move the hand, let go */
  | { type: 'grab'; phase: 'start'; body: number; point: [number, number, number] }
  | { type: 'grab'; phase: 'move'; point: [number, number, number]; turn: [number, number, number, number] | null }
  | { type: 'grab'; phase: 'end' }
  | { type: 'run'; id: number; seconds: number; pushes?: Array<{ at: number; robot: string; force: [number, number, number] }>; frames?: number[] }
  | { type: 'dispose' };

export type SimResponse =
  | { type: 'ready'; version: string; nq: number; nu: number; nbody: number }
  | { type: 'error'; message: string; id?: number }
  | { type: 'frame'; poses: Float64Array; stats: ReturnType<SimEngine['stats']>; playing: boolean }
  | { type: 'ran'; id: number; stats: ReturnType<SimEngine['stats']>; frames: Array<{ t: number; poses: Float64Array }> };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: MainModule | null = null;
let engine: SimEngine | null = null;
let playing = false;
let speed = 1;
let timer = 0;
let last = 0;
// Real-time factor: sim seconds per wall second, smoothed
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
  // Can't keep up: slow down rather than spiral (the bar shows the real-time factor)
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

ctx.onmessage = async (ev: MessageEvent<SimRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'load': {
        mj ??= await loadMujoco();
        engine?.dispose();
        engine = null;
        playing = false;
        engine = new SimEngine(mj, msg.model);
        if (msg.controller) engine.setController(msg.controller);
        const m = engine.model;
        post({ type: 'ready', version: mj.mj_versionString(), nq: m.nq, nu: m.nu, nbody: m.nbody });
        frame();
        break;
      }
      case 'play':
        if (!engine || playing) break;
        playing = true;
        last = performance.now();
        loop();
        break;
      case 'pause':
        playing = false;
        clearTimeout(timer);
        frame();
        break;
      case 'reset':
        engine?.reset(msg.initial);
        frame();
        break;
      case 'speed':
        speed = msg.value;
        break;
      case 'controller':
        engine?.setController(msg.controller);
        break;
      case 'grab':
        if (msg.phase === 'start') engine?.grabStart(msg.body, msg.point);
        else if (msg.phase === 'move') engine?.grabMove(msg.point, msg.turn);
        else engine?.grabEnd();
        break;
      case 'push':
        engine?.pushRobot(msg.robot, msg.force, msg.seconds);
        break;
      case 'run': {
        if (!engine) throw new Error('Nothing loaded');
        const pushes = [...(msg.pushes ?? [])].sort((a, b) => a.at - b.at);
        const wanted = [...(msg.frames ?? [])].sort((a, b) => a - b);
        const frames: Array<{ t: number; poses: Float64Array }> = [];
        const start = engine.data.time;
        const end = start + msg.seconds;
        while (engine.data.time < end - 1e-9) {
          const t = engine.data.time - start;
          while (pushes.length && pushes[0].at <= t + 1e-9) {
            const p = pushes.shift()!;
            engine.pushRobot(p.robot, p.force);
          }
          while (wanted.length && wanted[0] <= t + 1e-9) frames.push({ t: wanted.shift()!, poses: engine.poses() });
          engine.step(Math.min(0.02, end - engine.data.time));
        }
        if (wanted.length) frames.push({ t: msg.seconds, poses: engine.poses() });
        post({ type: 'ran', id: msg.id, stats: engine.stats(), frames });
        break;
      }
      case 'dispose':
        playing = false;
        clearTimeout(timer);
        engine?.dispose();
        engine = null;
        break;
    }
  } catch (e) {
    post({ type: 'error', message: errorText(e), id: msg.type === 'run' ? msg.id : undefined });
  }
};
