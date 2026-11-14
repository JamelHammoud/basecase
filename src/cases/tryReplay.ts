import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import type { SimEngine } from '../sim/engine';
import { quatToMj, toMj, worldDeltas } from '../sim/mjcfFrames';
import { framePoses, Recorder, type RecordedCommand, type Recording } from '../sim/recorder';
import type { V3 } from '../utils/kinematics';
import { jitteredWorld, worldRandom } from './caseRandom';
import { startEngine } from './runCase';
import type { Case } from './schema';
import { scoreTry, type TryScoring } from './tries';

export interface Offset {
  move: V3;
  turnDeg: number;
}

export type Offsets = Map<string, Offset>;

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
    const move = moved[i].position.map((x, k) => x - o.position[k]) as V3;
    const turnDeg = moved[i].rotation[1] - o.rotation[1];

    if (turnDeg !== 0 || move.some((x) => x !== 0)) offsets.set(o.id, { move, turnDeg });
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
    const { move } = offsets.get(nearest(at, new THREE.Vector3(...target)))!;

    return { ...c, command: { ...c.command, target: target.map((x, k) => x + move[k]) as V3 } };
  });
}

function bodyOf(mj: MainModule, engine: SimEngine, id: string): number {
  const body = engine.sim.bodies.find((b) => b.world?.includes(id));

  return body ? mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name) : -1;
}

type MjQuat = [number, number, number, number];

export function turnedQuat([w, x, y, z]: MjQuat, turnDeg: number): MjQuat {
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (turnDeg * Math.PI) / 180);
  const [tw, tx, ty, tz] = quatToMj(yaw);
  const turned = new THREE.Quaternion(tx, ty, tz, tw).multiply(new THREE.Quaternion(x, y, z, w));

  return [turned.w, turned.x, turned.y, turned.z];
}

function turnBody(quats: Float64Array, body: number, turnDeg: number) {
  const at = body * 4;

  quats.set(turnedQuat([...quats.subarray(at, at + 4)] as MjQuat, turnDeg), at);
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
    const move = toMj(offset.move);

    if (body >= 0) move.forEach((x, k) => (into[at + k] += x));

    if (body >= 0 && joint < 0 && offset.turnDeg) turnBody(model.body_quat, body, offset.turnDeg);
  }

  mj.mj_forward(model, data);
}

interface Due {
  at: number;
  apply: () => void;
}

function timeline(
  engine: SimEngine,
  recorder: Recorder,
  source: { commands: RecordedCommand[]; recording: Recording },
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

    engine.stepHook = recorder.hook;
    engine.commandHook = recorder.command;
    roll(
      engine,
      recorder,
      timeline(engine, recorder, { commands: shiftedCommands(source, offsets), recording }),
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
