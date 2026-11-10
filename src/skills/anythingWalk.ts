import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { RouteLimits } from '../sim/route';
import type { Environment } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import { kitTopSpeed } from './kitModel';
import { kitSchedule, scheduledMinutes } from './kitSchedule';
import { trainKitEntry } from './motorKit';
import type { BodyFacts } from './anythingBody';
import { planRoute, timedVariants, type RoutePlan, type RouteVariant } from './anythingRoute';
import type { TaskSpec } from './anythingTypes';

const ARENA_MINUTES = 8;
const TURN_RAD_S = 0.6;

export function walkLimits(model: SimModel): RouteLimits {
  const top = kitTopSpeed(model);

  return { forward: [0, top], left: [-0.25 * top, 0.25 * top], turn: TURN_RAD_S };
}

const ACCEL = { forward: 0.4, turn: 2 };

export function walkVariants(model: SimModel): RouteVariant[] {
  const limits = walkLimits(model);
  const brisk = { speed: 0.5 * limits.forward[1], band: 0.03 };

  const turning = { ...limits, left: [0, 0] as [number, number] };

  return [
    ...timedVariants(limits, ACCEL),
    { lead: 0.4, gain: 2, limits, accel: ACCEL, brisk },
    { lead: 0.4, gain: 2, limits: turning, accel: ACCEL },
  ];
}

export const walkMinutes = (model: SimModel) =>
  scheduledMinutes(kitSchedule(model, 'velocity-tracking')) + ARENA_MINUTES;

export interface WalkInput {
  mj: MainModule;
  model: SimModel;
  design: string;
  facts: BodyFacts;
  spec: TaskSpec;
  environment: Environment;
  forge: ForgeRunner;
  save: SkillSave;
  signal?: AbortSignal;
  secondsLeft: () => number;
}

export async function planWalk(input: WalkInput): Promise<RoutePlan> {
  const { mj, model } = input;

  if (input.secondsLeft() < walkMinutes(model) * 60)
    return { controller: null, reason: 'Too little time is left to learn a gait.' };

  const kit = await trainKitEntry({
    mj,
    design: input.design,
    model,
    entry: 'velocity-tracking',
    forge: input.forge,
    save: input.save,
    signal: input.signal,
  });

  if (kit.kind !== 'skill' || kit.skill.controller.kind !== 'policy')
    return { controller: null, reason: kit.kind === 'refused' ? kit.reason : 'The gait isn’t a policy.' };

  return planRoute({
    mj,
    model,
    facts: input.facts,
    spec: input.spec,
    environment: input.environment,
    drive: { kind: 'policy', policy: kit.skill.controller.policy },
    variants: walkVariants(model),
    stop: () => !!input.signal?.aborted,
  });
}
