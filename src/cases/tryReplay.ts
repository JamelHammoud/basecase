import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import type { SimEngine } from '../sim/engine';
import { toMj, worldDeltas } from '../sim/mjcfFrames';
import { framePoses, Recorder, type RecordedCommand, type Recording } from '../sim/recorder';
import type { V3 } from '../utils/kinematics';
import { WorldMover } from '../sim/worldMover';
import { jitteredWorld, worldRandom } from './caseRandom';
import { startEngine } from './runCase';
import type { Case } from './schema';
import { scoreTry, type TryScoring } from './tries';

export type Offsets = Map<string, V3>;

export interface Variation {
  seed: number | null;
  passed: boolean;
  margin: number;
  failed: string[];
  recording: Recording;
}

export function worldOffsets(kase: Case, seed: number | null): Offsets {
  const offsets: Offsets = new Map();

  if (seed === null) return offsets;

  const moved = jitteredWorld(kase, worldRandom(seed), { spots: true }).world.objects;

  kase.world.objects.forEach((o, i) => {
    const offset = moved[i].position.map((x, k) => x - o.position[k]) as V3;

    if (offset.some((x) => x !== 0)) offsets.set(o.id, offset);
  });

  return offsets;
}

function objectsAt(source: TryScoring, frame: number, ids: string[]): Map<string, THREE.Vector3> {
  const deltas = worldDeltas(source.model, framePoses(source.recording, frame));
  const rest = new Map(source.kase.world.objects.map((o) => [o.id, o.position]));

  return new Map(
    ids.map((id) => [id, new THREE.Vector3(...rest.get(id)!).applyMatrix4(deltas.get(id) ?? new THREE.Matrix4())]),
  );
}

function nearest(at: Map<string, THREE.Vector3>, point: THREE.Vector3): string {
  let best = '';
  let bestDistance = Infinity;

  for (const [id, p] of at) {
    const distance = p.distanceTo(point);

    if (distance < bestDistance) [best, bestDistance] = [id, distance];
  }

  return best;
}

export function shiftedCommands(source: TryScoring, offsets: Offsets): RecordedCommand[] {
  const commands = source.recording.commands ?? [];
  const ids = [...offsets.keys()];

  if (!ids.length) return commands;

  return commands.map((c) => {
    const { target } = c.command;

    if (!target) return c;

    const at = objectsAt(source, Math.round(c.at / source.recording.dt), ids);
    const offset = offsets.get(nearest(at, new THREE.Vector3(...target)))!;

    return { ...c, command: { ...c.command, target: target.map((x, k) => x + offset[k]) as V3 } };
  });
}

function bodyOf(mj: MainModule, engine: SimEngine, id: string): number {
  const body = engine.sim.bodies.find((b) => b.world?.includes(id));

  return body ? mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name) : -1;
}

function placeStart(mj: MainModule, engine: SimEngine, start: { recording: Recording; offsets: Offsets }) {
  const { model, data } = engine;
  const { recording, offsets } = start;

  if (recording.nq !== model.nq || recording.nv !== model.nv) throw new Error('This try is from another model.');

  data.qpos.set(recording.qpos.subarray(0, recording.nq));
  data.qvel.set(recording.qvel.subarray(0, recording.nv));

  for (const [id, offset] of offsets) {
    const body = bodyOf(mj, engine, id);
    const joint = body < 0 ? -1 : model.body_jntadr[body];
    const into = joint >= 0 ? data.qpos : model.body_pos;
    const at = joint >= 0 ? model.jnt_qposadr[joint] : body * 3;
    const move = toMj(offset);

    if (body >= 0) move.forEach((x, k) => (into[at + k] += x));
  }

  mj.mj_forward(model, data);
}

const startChanges = (recording: Recording) => (recording.world ?? []).filter((w) => w.at <= 0).map((w) => w.change);

interface Due {
  at: number;
  apply: () => void;
}

function timeline(
  engine: SimEngine,
  recorder: Recorder,
  source: { commands: RecordedCommand[]; recording: Recording; mover: WorldMover },
) {
  const fault = (joint: string, kind: Parameters<SimEngine['setFault']>[1]) => () => {
    engine.setFault(joint, kind);
    recorder.fault(joint, kind);
  };
  const due: Due[] = source.commands.map((c) => ({ at: c.at, apply: () => engine.command(c.command) }));

  for (const f of source.recording.faults ?? []) {
    due.push({ at: f.at, apply: fault(f.joint, f.kind) });

    if (f.until !== undefined) due.push({ at: f.until, apply: fault(f.joint, null) });
  }

  for (const w of source.recording.world ?? [])
    if (w.at > 0) due.push({ at: w.at, apply: () => source.mover.apply(w.change) && recorder.world(w.change) });

  return due.sort((a, b) => a.at - b.at);
}

function roll(engine: SimEngine, recorder: Recorder, due: Due[], frames: number) {
  const start = engine.data.time;
  const maxSteps = Math.ceil((frames * recorder.dt) / engine.dt) + 10;
  let next = 0;

  for (let step = 0; recorder.length < frames && step < maxSteps; step++) {
    const t = engine.data.time - start;

    while (next < due.length && due[next].at <= t + 1e-9) due[next++].apply();

    engine.step(engine.dt);
  }
}

export async function replayTry(mj: MainModule, source: TryScoring, seed: number | null): Promise<Variation> {
  const { recording, model } = source;
  const { controller } = recording;

  if (!controller || !recording.commands) throw new Error('This try was recorded without its commands.');

  const offsets = worldOffsets(source.kase, seed);
  const { engine, dispose } = startEngine(mj, model, { controller, ...(seed === null ? {} : { seed }) });

  try {
    placeStart(mj, engine, { recording, offsets });

    const mover = new WorldMover(mj, engine);

    mover.replay(recording.world ?? [], 0);

    const recorder = new Recorder(engine, controller, startChanges(recording));

    engine.stepHook = recorder.hook;
    engine.commandHook = recorder.command;
    roll(
      engine,
      recorder,
      timeline(engine, recorder, { commands: shiftedCommands(source, offsets), recording, mover }),
      recording.frames,
    );

    const replayed = recorder.finish();
    const verdict = await scoreTry({ ...source, recording: replayed });

    return { seed, passed: verdict.passed, margin: verdict.margin, failed: verdict.failed, recording: replayed };
  } finally {
    dispose();
  }
}

export interface Multiplied {
  tried: number;
  kept: Variation[];
}

export async function multiplyTry(mj: MainModule, source: TryScoring, seeds: number[]): Promise<Multiplied> {
  const kept: Variation[] = [];

  for (const seed of seeds) {
    const variation = await replayTry(mj, source, seed);

    if (variation.passed) kept.push(variation);
  }

  return { tried: seeds.length, kept };
}
