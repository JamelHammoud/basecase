import type { MainModule } from '@mujoco/mujoco';
import type { Controller, SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { ArenaWorld } from './arenaWorld';
import type { Environment } from './environment';
import { nominal } from './rollout';

export const COACH_SIGNALS = ['foot_clearance', 'contact_impulse', 'joint_jerk', 'base_height', 'speed'] as const;

export type CoachSignal = (typeof COACH_SIGNALS)[number];
export type CoachSignals = Record<CoachSignal, number>;
export type CoachDirection = 'up' | 'down';

interface SignalSpec {
  unit: string;
  digits: number;
  share: number;
  floor: number;
  meaning: string;
}

export const SIGNAL_SPECS: Record<CoachSignal, SignalSpec> = {
  foot_clearance: {
    unit: 'mm',
    digits: 1,
    share: 0.1,
    floor: 2,
    meaning: 'how high the feet rise: each foot’s highest minus lowest point over the run, averaged over the feet',
  },
  contact_impulse: {
    unit: 'N s',
    digits: 3,
    share: 0.1,
    floor: 0.005,
    meaning: 'the hardest landing: the largest vertical impulse the floor gives the robot in one 20 ms step',
  },
  joint_jerk: {
    unit: 'rad/s³',
    digits: 0,
    share: 0.1,
    floor: 50,
    meaning: 'how abruptly the joints move: the root mean square of every actuated joint’s jerk',
  },
  base_height: { unit: 'mm', digits: 1, share: 0.03, floor: 5, meaning: 'the base’s mean height above the floor' },
  speed: { unit: 'm/s', digits: 3, share: 0.1, floor: 0.01, meaning: 'the mean forward speed over the run' },
};

export const isCoachSignal = (name: unknown): name is CoachSignal =>
  typeof name === 'string' && (COACH_SIGNALS as readonly string[]).includes(name);

export const signalNumber = (signal: CoachSignal, value: number) =>
  `${value.toFixed(SIGNAL_SPECS[signal].digits)} ${SIGNAL_SPECS[signal].unit}`;

export const minimumMove = (signal: CoachSignal, before: number) =>
  Math.max(SIGNAL_SPECS[signal].floor, SIGNAL_SPECS[signal].share * Math.abs(before));

export function movedEnough(change: { signal: CoachSignal; direction: CoachDirection; before: number; after: number }) {
  const { signal, direction, before, after } = change;
  const delta = direction === 'up' ? after - before : before - after;

  return Number.isFinite(delta) && delta >= minimumMove(signal, before);
}

interface Bodies {
  root: number;
  rootDof: number;
  feet: number[];
  dofs: number[];
}

function bodiesOf(mj: MainModule, engine: SimEngine, environment: Environment): Bodies {
  const { model, sim } = engine;
  const robot = sim.robots.find((r) => r.key === environment.robot);

  if (!robot) throw new Error(`The model has no robot ${environment.robot}.`);

  const root = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, robot.root);
  const free = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value, robot.root);
  const parent = (b: number) => model.body_parentid[b] as number;
  const under = (b: number): boolean => b === root || (b > 0 && under(parent(b)));
  const bodies = Array.from({ length: model.nbody }, (_, b) => b).filter(under);
  const parents = new Set(bodies.map(parent));
  const dofs = environment.action.joints.flatMap((id) => {
    const joint = sim.joints.find((j) => j.id === id);
    const at = joint ? mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value, joint.name) : -1;

    return at < 0 ? [] : [model.jnt_dofadr[at] as number];
  });

  return { root, rootDof: free < 0 ? -1 : model.jnt_dofadr[free], feet: bodies.filter((b) => !parents.has(b)), dofs };
}

interface Trace {
  feet: number[][];
  heights: number[];
  forward: number[];
  velocities: number[][];
  impulses: number[];
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function jerk(velocities: number[][], dt: number): number {
  const squares: number[] = [];

  for (let t = 1; t + 1 < velocities.length; t++)
    velocities[t].forEach((v, j) => {
      const a = (velocities[t + 1][j] - 2 * v + velocities[t - 1][j]) / (dt * dt);

      squares.push(a * a);
    });

  return Math.sqrt(mean(squares));
}

function summary(trace: Trace, environment: Environment): CoachSignals {
  const seconds = (trace.forward.length - 1) * environment.traceDt;

  return {
    foot_clearance: mean(trace.feet.map(spread)) * 1000,
    contact_impulse: Math.max(0, ...trace.impulses),
    joint_jerk: jerk(trace.velocities, environment.traceDt),
    base_height: mean(trace.heights) * 1000,
    speed: seconds > 0 ? (trace.forward.at(-1)! - trace.forward[0]) / seconds : 0,
  };
}

function record(engine: SimEngine, bodies: Bodies, trace: Trace) {
  const { data } = engine;

  bodies.feet.forEach((b, i) => trace.feet[i].push(data.xpos[b * 3 + 2]));
  trace.heights.push(data.xpos[bodies.root * 3 + 2]);
  trace.forward.push(-data.xpos[bodies.root * 3 + 1]);
  trace.velocities.push(bodies.dofs.map((d) => data.qvel[d]));
}

export async function measureCoachSignals(options: {
  mj: MainModule;
  model: SimModel;
  environment: Environment;
  controller: Controller;
}): Promise<CoachSignals> {
  const { mj, model, environment, controller } = options;
  const world = new ArenaWorld(mj, model);

  try {
    const { engine } = world;
    const bodies = bodiesOf(mj, engine, environment);
    const trace: Trace = { feet: bodies.feet.map(() => []), heights: [], forward: [], velocities: [], impulses: [] };
    const ticks = Math.floor(environment.horizonS / environment.traceDt + 1e-9) + 1;
    const start = environment.reset.pose ?? model.initial;

    world.prepare({ instance: nominal(world), controller, start, robot: environment.robot });
    record(engine, bodies, trace);

    for (let tick = 1; tick < ticks; tick++) {
      let impulse = 0;

      engine.step(environment.traceDt, () => {
        if (bodies.rootDof >= 0) impulse += Math.max(0, engine.data.qfrc_constraint[bodies.rootDof + 2]) * engine.dt;
      });
      trace.impulses.push(impulse);
      record(engine, bodies, trace);
    }

    return summary(trace, environment);
  } finally {
    world.dispose();
  }
}
