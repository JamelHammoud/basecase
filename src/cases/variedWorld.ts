import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from '../sim/engine';
import { fromMj, toMj } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { RecordedCommand } from '../sim/recordedCommands';
import type { V3 } from '../utils/kinematics';
import { jitteredWorld, worldRandom } from './caseRandom';
import type { Case } from './schema';

export interface MovedObject {
  id: string;
  body: number;
  offset: V3;
}

export interface VariedWorld {
  kase: Case;
  moved: MovedObject[];
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function variedWorld(model: SimModel, kase: Case, seed: number | null): VariedWorld {
  if (seed === null) return { kase, moved: [] };

  const varied = jitteredWorld(kase, worldRandom(seed), { spots: true });
  const moved = varied.world.objects.flatMap((o, i): MovedObject[] => {
    const was = kase.world.objects[i].position;
    const offset: V3 = [o.position[0] - was[0], o.position[1] - was[1], o.position[2] - was[2]];
    const body = model.bodies.findIndex((b) => b.world?.includes(o.id));

    return body >= 0 && offset.some((x) => x !== 0) ? [{ id: o.id, body, offset }] : [];
  });

  return { kase: varied, moved };
}

export function movedModel(model: SimModel, moved: MovedObject[]): SimModel {
  if (!moved.length) return model;

  const bodies = model.bodies.map((b, i) => {
    const m = moved.find((x) => x.body === i);

    return m ? { ...b, origin: add(b.origin, m.offset) } : b;
  });

  return { ...model, bodies };
}

export function placeStart(mj: MainModule, engine: SimEngine, source: Recording, moved: MovedObject[]) {
  const { model, data } = engine;

  data.qpos.set(source.qpos.subarray(0, source.nq));
  data.qvel.set(source.qvel.subarray(0, source.nv));

  for (const m of moved) {
    const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, engine.sim.bodies[m.body].name);
    const joint = id >= 0 ? model.body_jntadr[id] : -1;
    const shift = toMj(m.offset);

    if (id < 0) continue;

    const into = joint >= 0 ? data.qpos : model.body_pos;
    const at = joint >= 0 ? model.jnt_qposadr[joint] : id * 3;

    for (let k = 0; k < 3; k++) into[at + k] += shift[k];
  }

  mj.mj_forward(model, data);
}

function bodyAt(source: Recording, frame: number, body: number): V3 {
  const at = (frame * source.nbody + body) * 7;

  return fromMj(source.poses[at], source.poses[at + 1], source.poses[at + 2]);
}

const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const FOLLOW_NEAR = 0.25;

export const FOLLOW_FAR = 0.5;

export interface ShiftAt {
  source: Recording;
  frame: number;
  moved: MovedObject[];
  reachMm: number;
}

const follows = (distanceMm: number, reachMm: number) =>
  Math.max(0, Math.min(1, (FOLLOW_FAR * reachMm - distanceMm) / ((FOLLOW_FAR - FOLLOW_NEAR) * reachMm)));

export function shiftedCommand(command: RecordedCommand, at: ShiftAt): RecordedCommand {
  const { target } = command;

  if (!target || !at.moved.length || at.reachMm <= 0) return command;

  const near = (m: MovedObject) => distance(target, bodyAt(at.source, at.frame, m.body));
  const nearest = at.moved.reduce((best, m) => (near(m) < near(best) ? m : best));
  const share = follows(near(nearest), at.reachMm);

  return { ...command, target: add(target, nearest.offset.map((x) => x * share) as V3) };
}
