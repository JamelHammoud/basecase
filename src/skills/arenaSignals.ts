import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from '../sim/engine';
import type { Axis, SignalSource } from './environment';

export type SignalReader = () => number;

const AXIS: Record<Axis, number> = { x: 0, y: 1, z: 2 };

interface Lookup {
  mj: MainModule;
  engine: SimEngine;
  robot: string;
}

function objectId(lookup: Lookup, type: 'body' | 'joint' | 'geom', name: string): number {
  const { mj, engine } = lookup;
  const kinds = {
    body: mj.mjtObj.mjOBJ_BODY.value,
    joint: mj.mjtObj.mjOBJ_JOINT.value,
    geom: mj.mjtObj.mjOBJ_GEOM.value,
  };
  const id = mj.mj_name2id(engine.model, kinds[type], name);

  if (id < 0) throw new Error(`The model has no ${type} named ${name}.`);

  return id;
}

function simJoint(lookup: Lookup, id: string) {
  const joint = lookup.engine.sim.joints.find((j) => j.id === id);

  if (!joint) throw new Error(`The model has no joint ${id}.`);

  return joint;
}

function partBody(lookup: Lookup, part: string): number {
  const body = lookup.engine.sim.bodies.find((b) => b.parts.includes(part));

  if (!body) throw new Error(`The model has no part ${part}.`);

  return objectId(lookup, 'body', body.name);
}

function rootBody(lookup: Lookup): number {
  const robot = lookup.engine.sim.robots.find((r) => r.key === lookup.robot);

  if (!robot) throw new Error(`The model has no robot ${lookup.robot}.`);

  return objectId(lookup, 'body', robot.root);
}

function contactReader(lookup: Lookup, part: string, other: string): SignalReader {
  const { engine } = lookup;
  const body = partBody(lookup, part);
  const floor = other === 'floor' ? objectId(lookup, 'geom', 'floor') : -1;
  const otherBody = other === 'floor' ? -1 : partBody(lookup, other);
  const geomBody = engine.model.geom_bodyid;
  const touches = (a: number, b: number) =>
    geomBody[a] === body && (floor >= 0 ? b === floor : geomBody[b] === otherBody);

  return () => {
    const { data } = engine;
    let found = 0;

    for (let i = 0; i < data.ncon && !found; i++) {
      const c = data.contact.get(i);

      if (c && (touches(c.geom1, c.geom2) || touches(c.geom2, c.geom1))) found = 1;

      c?.delete();
    }

    return found;
  };
}

function jointReader(lookup: Lookup, source: Extract<SignalSource, { joint: string }>): SignalReader {
  const { engine } = lookup;
  const joint = simJoint(lookup, source.joint);
  const id = objectId(lookup, 'joint', joint.name);

  if (source.kind === 'joint-position') {
    const adr = engine.model.jnt_qposadr[id];

    return () => engine.data.qpos[adr];
  }

  if (source.kind === 'joint-velocity') {
    const adr = engine.model.jnt_dofadr[id];

    return () => engine.data.qvel[adr];
  }

  return () => (joint.actuator >= 0 ? engine.data.actuator_force[joint.actuator] : 0);
}

function baseReader(lookup: Lookup, kind: 'base-height' | 'base-tilt' | 'base-forward'): SignalReader {
  const { engine } = lookup;
  const b = rootBody(lookup);

  if (kind === 'base-height') return () => engine.data.xpos[b * 3 + 2];

  if (kind === 'base-forward') return () => -engine.data.xpos[b * 3 + 1];

  return () => Math.acos(Math.max(-1, Math.min(1, engine.data.xmat[b * 9 + 8])));
}

export function signalReader(lookup: Lookup, source: SignalSource): SignalReader {
  const { engine } = lookup;

  switch (source.kind) {
    case 'time':
      return () => engine.data.time;
    case 'joint-position':
    case 'joint-velocity':
    case 'joint-effort':
      return jointReader(lookup, source);
    case 'part-position': {
      const b = partBody(lookup, source.part);
      const axis = AXIS[source.axis];

      return () => engine.data.xpos[b * 3 + axis];
    }
    case 'contact':
      return contactReader(lookup, source.part, source.with);
    default:
      return baseReader(lookup, source.kind);
  }
}

export function signalReaders(lookup: Lookup, signals: Record<string, SignalSource>): Record<string, SignalReader> {
  return Object.fromEntries(Object.entries(signals).map(([name, source]) => [name, signalReader(lookup, source)]));
}
