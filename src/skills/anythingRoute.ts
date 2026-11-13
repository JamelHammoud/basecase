import type { MainModule } from '@mujoco/mujoco';
import type { WheelSetup } from '../sim/drive';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RouteDrive, RouteKey, RouteLimits } from '../sim/route';
import type { SkillController } from './artifacts';
import type { Environment } from './environment';
import type { BodyFacts } from './anythingBody';
import { betterJudged, judgeOn, Trials, type Judged } from './anythingSim';
import type { TaskSpec } from './anythingTypes';
import { plural } from '../../electron/plural.mjs';

const CHECK_CASES = 8;

export interface RouteVariant {
  lead: number;
  gain: number;
  limits: RouteLimits;
  accel?: { forward: number; turn: number };
  brisk?: { speed: number; band: number };
}

const TIMINGS = [
  { lead: 0.4, gain: 2 },
  { lead: 0.8, gain: 2 },
  { lead: 0.4, gain: 3.5 },
  { lead: 0, gain: 1.5 },
];

export const timedVariants = (limits: RouteLimits, accel?: RouteVariant['accel']): RouteVariant[] =>
  TIMINGS.map((t) => ({ ...t, limits, ...(accel ? { accel } : {}) }));

const ROVER_LIMITS: RouteLimits = { forward: [-0.2, 0.2], left: [0, 0], turn: 1.5 };
const ROVER_REVERSE: RouteLimits = { forward: [-0.12, 0], left: [0, 0], turn: 1.5 };

export const roverVariants = (): RouteVariant[] => [
  ...timedVariants(ROVER_LIMITS, { forward: 0.6, turn: 6 }),
  { lead: 0.4, gain: 1.5, limits: ROVER_REVERSE, accel: { forward: 0.08, turn: 3 } },
  { lead: 0.8, gain: 1, limits: ROVER_REVERSE, accel: { forward: 0.05, turn: 3 } },
];

export function wheelSetups(mj: MainModule, model: SimModel, facts: BodyFacts): WheelSetup[] {
  const engine = new SimEngine(mj, model);

  try {
    const { data } = engine;
    const wheels = facts.joints.filter((j) => j.actuated && j.drive === 'velocity');
    const ids = wheels.map((j) => mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, j.name));
    const cx = ids.reduce((s, id) => s + data.xanchor[id * 3], 0) / Math.max(ids.length, 1);

    return wheels.map((w, k) => {
      const id = ids[k];
      const body = engine.model.jnt_bodyid[id];
      const rolling = data.xaxis[id * 3];
      const geoms = Array.from({ length: engine.model.ngeom }, (_, g) => g).filter(
        (g) => engine.model.geom_bodyid[g] === body,
      );
      const radius = Math.max(
        ...geoms.map((g) =>
          Math.max(...Array.from(engine.model.geom_size.slice(g * 3, g * 3 + 3) as ArrayLike<number>)),
        ),
        0.001,
      );

      return {
        joint: w.id,
        spin: rolling >= 0 ? 1 : -1,
        lateralMm: (data.xanchor[id * 3] - cx) * 1000,
        radiusMm: radius * 1000,
      };
    });
  } finally {
    engine.dispose();
  }
}

export function routeKeys(spec: TaskSpec, lead: number): RouteKey[] {
  let last = -1;
  const keys = [{ t: 0, base: {} }, ...spec.intent].map((k) => {
    const t = Math.max(last + 0.02, k.t > 0 ? k.t - lead : 0);

    last = t;

    return { t, forward: k.base?.forward ?? 0, left: k.base?.left ?? 0 };
  });

  return keys.filter((k, i) => i === 0 || k.t > keys[i - 1].t);
}

export function routeController(options: {
  facts: BodyFacts;
  spec: TaskSpec;
  drive: RouteDrive;
  variant: RouteVariant;
}): SkillController {
  const { facts, spec, drive, variant } = options;
  const { lead, gain, limits, accel, brisk } = variant;

  return {
    kind: 'route',
    robot: facts.robot,
    route: {
      keys: routeKeys(spec, lead),
      gain,
      headingGain: 2.5,
      deadband: 0.008,
      limits,
      ...(accel ? { accel } : {}),
      ...(brisk ? { brisk } : {}),
    },
    drive,
  };
}

export interface RoutePlan {
  controller: SkillController | null;
  reason: string;
}

export async function planRoute(options: {
  mj: MainModule;
  model: SimModel;
  facts: BodyFacts;
  spec: TaskSpec;
  environment: Environment;
  drive: RouteDrive;
  variants: RouteVariant[];
  stop: () => boolean;
}): Promise<RoutePlan> {
  const trials = new Trials({ mj: options.mj, model: options.model, environment: options.environment });

  try {
    const cases = trials.cases(CHECK_CASES - 1, `route|${options.spec.name}`);
    const all = cases.length;
    let best: { controller: SkillController; judged: Judged } | null = null;

    for (const variant of options.variants) {
      if (options.stop() || (best && best.judged.passed === all && best.judged.worst > 0.5)) break;

      const controller = routeController({ ...options, variant });
      const judged = await judgeOn(trials, controller, cases);

      if (!best || betterJudged(judged, best.judged)) best = { controller, judged };
    }

    const passed = best?.judged.passed ?? 0;

    return {
      controller: passed === all ? best!.controller : null,
      reason: `The route passed ${passed} of ${plural(all, 'check')} before Arena.`,
    };
  } finally {
    trials.dispose();
  }
}
