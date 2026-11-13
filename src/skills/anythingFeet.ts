import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from '../sim/engine';
import type { BodyFacts, V3 } from './anythingBody';
import { tiltGoal, type IkTarget } from './anythingIk';

export interface Foot {
  part: string;
  body: number;
  local: V3;
  world: V3;
  flat: boolean;
  tilt: [number, number];
}

const FLAT_SPREAD = 0.01;

function otherGeom(c: { geom1: number; geom2: number }, floor: number): number {
  if (c.geom1 === floor) return c.geom2;

  return c.geom2 === floor ? c.geom1 : -1;
}

function contactsByBody(mj: MainModule, engine: SimEngine): Map<number, V3[]> {
  const { model, data } = engine;
  const floor = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM.value, 'floor');
  const out = new Map<number, V3[]>();
  const contacts = data.contact;

  for (let i = 0; i < data.ncon; i++) {
    const c = contacts.get(i);
    const other = c ? otherGeom(c, floor) : -1;

    if (c && other >= 0) {
      const body = model.geom_bodyid[other];
      const pos = c.pos as ArrayLike<number>;

      out.set(body, [...(out.get(body) ?? []), [pos[0], pos[1], pos[2]]]);
    }

    c?.delete();
  }

  contacts.delete();

  return out;
}

const spreadOf = (points: V3[]) =>
  Math.max(0, ...points.flatMap((a) => points.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));

export function restFeet(options: {
  mj: MainModule;
  engine: SimEngine;
  facts: BodyFacts;
  bodyOf: (part: string) => number;
}): Foot[] {
  const { mj, engine, facts, bodyOf } = options;

  if (facts.cls !== 'legs') return [];

  engine.setState(facts.rest);
  mj.mj_collision(engine.model, engine.data);

  const touching = contactsByBody(mj, engine);
  const { xpos, xmat } = engine.data;

  return facts.parts
    .filter((p) => p.leaf)
    .map((p) => {
      const body = bodyOf(p.id);
      const points = touching.get(body) ?? [[xpos[body * 3], xpos[body * 3 + 1], xpos[body * 3 + 2]]];
      const world = [0, 1, 2].map((k) => points.reduce((s, pt) => s + pt[k], 0) / points.length) as V3;
      const d = [0, 1, 2].map((k) => world[k] - xpos[body * 3 + k]);
      const local = [0, 1, 2].map((c) => d.reduce((s, v, r) => s + xmat[body * 9 + r * 3 + c] * v, 0)) as V3;

      return {
        part: p.id,
        body,
        local,
        world,
        flat: spreadOf(points) >= FLAT_SPREAD,
        tilt: [xmat[body * 9 + 2], xmat[body * 9 + 5]] as [number, number],
      };
    });
}

export function footTargets(foot: Foot, shift: { forward: number; left: number }): IkTarget[] {
  const { body, local, world } = foot;
  const at: V3 = [world[0] + shift.left, world[1] - shift.forward, world[2]];
  const position = ([0, 1, 2] as const).map((axis) => ({ body, axis, value: at[axis], local }));
  const flat = foot.flat
    ? ([0, 1] as const).map((axis) => ({ body, axis, value: tiltGoal(foot.tilt[axis]), tilt: true }))
    : [];

  return [...position, ...flat];
}
