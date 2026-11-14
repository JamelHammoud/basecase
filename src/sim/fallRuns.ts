import type { MainModule } from '@mujoco/mujoco';
import { TorqueRecorder } from '../utils/peakTorque';
import type { SimEngine } from './engine';
import { demandedTorques, jointForces, limitForces } from './simForces';

export interface FallPush {
  atS: number;
  share: number;
  seconds: number;
  releaseDeg: number;
}

export interface FallPlan {
  robot: string;
  newtons: number;
  directions: number[];
  seconds: number;
  push: FallPush;
  windowS: number;
  forceLimits?: Record<string, number>;
}

export interface FallRun {
  deg: number;
  fell: boolean;
  touchS: number | null;
  windowS: number;
  absDemand: number[][];
}

const D2R = Math.PI / 180;

export const FALL_PUSH: FallPush = { atS: 0.5, share: 0.8, seconds: 1, releaseDeg: 25 };
export const FALL_SECONDS = 2;
export const FALL_WINDOW_S = 0.01;
export const FALL_DIRECTIONS = Array.from({ length: 12 }, (_, i) => i * 30);

export const fallForce = (deg: number, newtons: number): [number, number, number] => [
  Math.sin(deg * D2R) * newtons,
  0,
  Math.cos(deg * D2R) * newtons,
];

function otherGeom(c: { geom1: number; geom2: number }, floor: number): number {
  if (c.geom1 === floor) return c.geom2;

  return c.geom2 === floor ? c.geom1 : -1;
}

function floorBodies(engine: SimEngine, floor: number): Set<number> {
  const { model, data } = engine;
  const bodies = new Set<number>();
  const contacts = data.contact;

  for (let i = 0; i < data.ncon; i++) {
    const c = contacts.get(i);
    const other = c ? otherGeom(c, floor) : -1;

    if (other >= 0) bodies.add(model.geom_bodyid[other]);

    c?.delete();
  }

  contacts.delete();

  return bodies;
}

const touchesNew = (now: Set<number>, rest: Set<number>) => [...now].some((b) => !rest.has(b));

function oneFall(mj: MainModule, engine: SimEngine, plan: FallPlan, deg: number): FallRun {
  const floor = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_GEOM.value, 'floor');
  const n = engine.sim.joints.length;
  const recorder = new TorqueRecorder(n, engine.dt, { windowS: plan.windowS });
  const demand = new Float64Array(n);
  const actual = new Float64Array(n);
  let rest: Set<number> | null = null;
  let touchS: number | null = null;
  const afterStep = () => {
    recorder.add(
      demandedTorques(engine.model, engine.data, engine.sim.joints, demand),
      jointForces(engine.data, engine.sim.joints, actual),
    );

    if (!rest || touchS !== null) return;

    if (touchesNew(floorBodies(engine, floor), rest)) touchS = engine.data.time;
  };

  engine.reset();
  engine.step(plan.push.atS, afterStep);
  rest = floorBodies(engine, floor);
  engine.pushRobot(plan.robot, fallForce(deg, plan.newtons), plan.push);
  engine.step(plan.seconds - engine.data.time, afterStep);

  const robot = engine.stats().robots.find((r) => r.key === plan.robot);
  const series = recorder.series();

  return { deg, fell: robot?.fellAt != null, touchS, windowS: series.windowS, absDemand: series.absDemand };
}

export function runFalls(mj: MainModule, engine: SimEngine, plan: FallPlan): FallRun[] {
  if (plan.forceLimits) limitForces(engine.model, engine.sim, plan.forceLimits);

  engine.setController({ kind: 'hold' });

  return plan.directions.map((deg) => oneFall(mj, engine, plan, deg));
}
