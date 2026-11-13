import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';

export type V3 = [number, number, number];
export type BodyClass = 'arm' | 'wheels' | 'legs' | 'other';

export interface PartFact {
  id: string;
  body: string;
  leaf: boolean;
  right: number;
  forward: number;
  up: number;
  height: number;
}

export interface JointFact {
  id: string;
  name: string;
  restDeg: number;
  range: [number, number] | null;
  drive: string;
  actuated: boolean;
}

export interface BodyFacts {
  cls: BodyClass;
  robot: string;
  root: string;
  floating: boolean;
  rootPart: string;
  base: V3;
  heightM: number;
  rest: number[];
  parts: PartFact[];
  joints: JointFact[];
}

const D2R = Math.PI / 180;
const SETTLE_S = 2;
const SETTLED_TILT = 0.3;

const CLASS: Record<string, BodyClass> = { fixed: 'arm', wheeled: 'wheels', legged: 'legs' };

function settled(engine: SimEngine, rootBody: number, floating: boolean): number[] {
  const initial = Array.from(engine.data.qpos as ArrayLike<number>);

  if (!floating) return initial;

  engine.setController({ kind: 'hold' });
  engine.step(SETTLE_S);

  const tilt = Math.acos(Math.max(-1, Math.min(1, engine.data.xmat[rootBody * 9 + 8])));

  return tilt < SETTLED_TILT ? Array.from(engine.data.qpos as ArrayLike<number>) : initial;
}

function partFacts(mj: MainModule, engine: SimEngine, base: V3): PartFact[] {
  const { model, data } = engine;
  const parents = new Set(Array.from({ length: model.nbody }, (_, b) => model.body_parentid[b]));

  return engine.sim.bodies.flatMap((b) => {
    const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, b.name);

    if (id < 0) return [];

    const [x, y, z] = [data.xpos[id * 3], data.xpos[id * 3 + 1], data.xpos[id * 3 + 2]];
    const mm = (v: number) => Math.round(v * 10000) / 10;

    return b.parts.map((part) => ({
      id: part,
      body: b.name,
      leaf: !parents.has(id),
      right: mm(-(x - base[0])),
      forward: mm(-(y - base[1])),
      up: mm(z - base[2]),
      height: mm(z),
    }));
  });
}

function jointFacts(mj: MainModule, engine: SimEngine, robot: string): JointFact[] {
  const { model, data } = engine;

  return engine.sim.joints
    .filter((j) => j.robot === robot)
    .map((j) => {
      const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value, j.name);
      const q = data.qpos[model.jnt_qposadr[id]];

      return {
        id: j.id,
        name: j.name,
        restDeg: Math.round((j.type === 'revolute' ? q / D2R : q * 1000) * 10) / 10,
        range: j.range ?? null,
        drive: j.drive,
        actuated: j.actuator >= 0,
      };
    });
}

export function bodyFacts(mj: MainModule, model: SimModel): BodyFacts {
  const robot = model.robots[0];

  if (!robot) throw new Error('The scene has no robot with joints.');

  const engine = new SimEngine(mj, model);

  try {
    const rootBody = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, robot.root);
    const rest = settled(engine, rootBody, robot.floating);

    engine.setState(rest);

    const { xpos } = engine.data;
    const base: V3 = [xpos[rootBody * 3], xpos[rootBody * 3 + 1], xpos[rootBody * 3 + 2]];
    const rootPart = engine.sim.bodies.find((b) => b.name === robot.root)?.parts[0] ?? '';

    return {
      cls: CLASS[robot.morphology] ?? 'other',
      robot: robot.key,
      root: robot.root,
      floating: robot.floating,
      rootPart,
      base,
      heightM: base[2],
      rest,
      parts: partFacts(mj, engine, base),
      joints: jointFacts(mj, engine, robot.key),
    };
  } finally {
    engine.dispose();
  }
}

const CLASS_WORDS: Record<BodyClass, string> = {
  arm: 'a fixed-base arm: its base is bolted down, so it cannot travel, stand, crouch or walk',
  wheels: 'a wheeled rover with a floating base: it drives on wheels and turns in place, but it has no legs or arm',
  legs: 'a legged robot with a floating base: it stands on its feet and can walk, crouch, lean and lift a foot, but it has no arm',
  other: 'a robot of no standard class',
};

export function describeBody(facts: BodyFacts): string {
  const parts = facts.parts.map(
    (p) =>
      `- ${p.id}${p.leaf ? ' (end of a chain)' : ''}: right ${p.right}, forward ${p.forward}, up ${p.up} mm from the base; ${p.height} mm above the floor`,
  );
  const joints = facts.joints.map(
    (j) =>
      `- ${j.id}: rest ${j.restDeg}°, range ${j.range ? `${j.range[0]}° to ${j.range[1]}°` : 'continuous'}, ${j.drive} drive`,
  );

  return [
    `This robot is ${CLASS_WORDS[facts.cls]}.`,
    facts.floating ? `At rest its base stands ${Math.round(facts.heightM * 1000)} mm above the floor.` : '',
    `The base part is ${facts.rootPart}. Positions below are where each part sits at rest.`,
    'Parts:',
    ...parts,
    'Joints:',
    ...joints,
  ]
    .filter(Boolean)
    .join('\n');
}
