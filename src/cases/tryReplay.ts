import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import type { SimEngine } from '../sim/engine';
import { toMj, worldDeltas } from '../sim/mjcfFrames';
import { framePoses, Recorder, type RecordedCommand, type Recording } from '../sim/recorder';
import { WorldMoves } from '../sim/worldMoves';
import type { WorldEvent } from './worldSet';
import type { V3 } from '../utils/kinematics';
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

    if (o.movable) offsets.set(o.id, [0, 0, 0]);
    else if (offset.some((x) => x !== 0)) offsets.set(o.id, offset);
  });

  return offsets;
}

const TIE_MM = 1;
const held = (offset: V3) => offset.every((x) => x === 0);

const EPSILON_S = 1e-9;

function placedSince(world: readonly WorldEvent[], { from, to }: { from: number; to: number }): Map<string, V3> {
  const placed = new Map<string, V3>();

  for (const e of world) {
    if (e.pose?.position && e.at >= from - EPSILON_S && e.at <= to + EPSILON_S) placed.set(e.id, e.pose.position);
  }

  return placed;
}

function objectsAt(source: TryScoring, at: number, ids: string[]): Map<string, THREE.Vector3> {
  const { recording } = source;
  const frame = Math.round(at / recording.dt);
  const deltas = worldDeltas(source.model, framePoses(recording, frame));
  const rest = new Map(source.kase.world.objects.map((o) => [o.id, o.position]));
  const placed = placedSince(recording.world ?? [], { from: frame * recording.dt, to: at });
  const where = (id: string) => {
    const set = placed.get(id);

    return set
      ? new THREE.Vector3(...set)
      : new THREE.Vector3(...rest.get(id)!).applyMatrix4(deltas.get(id) ?? new THREE.Matrix4());
  };

  return new Map(ids.map((id) => [id, where(id)]));
}

function nearestOffset(at: Map<string, THREE.Vector3>, point: THREE.Vector3, offsets: Offsets): V3 {
  const ranked = [...at].map(([id, p]) => ({ offset: offsets.get(id)!, distance: p.distanceTo(point) }));
  const closest = Math.min(...ranked.map((r) => r.distance));
  const ties = ranked.filter((r) => r.distance <= closest + TIE_MM);

  return (ties.find((r) => held(r.offset)) ?? ranked.find((r) => r.distance === closest)!).offset;
}

export function shiftedCommands(source: TryScoring, offsets: Offsets): RecordedCommand[] {
  const commands = source.recording.commands ?? [];
  const ids = [...offsets.keys()];

  if (!ids.length || ids.every((id) => held(offsets.get(id)!))) return commands;

  return commands.map((c) => {
    const { target } = c.command;

    if (!target) return c;

    const at = objectsAt(source, c.at, ids);
    const offset = nearestOffset(at, new THREE.Vector3(...target), offsets);

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
    if (held(offset)) continue;

    const body = bodyOf(mj, engine, id);
    const joint = body < 0 ? -1 : model.body_jntadr[body];
    const into = joint >= 0 ? data.qpos : model.body_pos;
    const at = joint >= 0 ? model.jnt_qposadr[joint] : body * 3;
    const move = toMj(offset);

    if (body >= 0) move.forEach((x, k) => (into[at + k] += x));
  }

  mj.mj_forward(model, data);
}

interface Due {
  at: number;
  apply: () => void;
}

interface Replayed {
  engine: SimEngine;
  recorder: Recorder;
  world: WorldMoves;
}

function timeline(
  { engine, recorder, world }: Replayed,
  source: { commands: RecordedCommand[]; recording: Recording },
) {
  const fault = (joint: string, kind: Parameters<SimEngine['setFault']>[1]) => () => {
    engine.setFault(joint, kind);
    recorder.fault(joint, kind);
  };
  const due: Due[] = source.commands.map((c) => ({ at: c.at, apply: () => engine.command(c.command) }));

  const changeWorld = (change: WorldEvent) => () => {
    if (!world.apply(change)) recorder.worldChange(change);
  };

  for (const change of source.recording.world ?? []) due.push({ at: change.at, apply: changeWorld(change) });

  for (const f of source.recording.faults ?? []) {
    due.push({ at: f.at, apply: fault(f.joint, f.kind) });

    if (f.until !== undefined) due.push({ at: f.until, apply: fault(f.joint, null) });
  }

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

    const recorder = new Recorder(engine, controller);
    const world = new WorldMoves(mj, engine);

    engine.stepHook = recorder.hook;
    engine.commandHook = recorder.command;
    roll(
      engine,
      recorder,
      timeline({ engine, recorder, world }, { commands: shiftedCommands(source, offsets), recording }),
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
