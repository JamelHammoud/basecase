import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { SkillController } from './artifacts';
import type { Environment } from './environment';
import { cem } from './anythingCem';
import type { Poser } from './anythingPoser';
import { betterJudged, judgeOn, Trials, type Judged, type TrialCase } from './anythingSim';
import { augmented, type Key } from './anythingAugment';
import { Statics, type JointValues } from './anythingStatics';
import type { TaskSpec } from './anythingTypes';

const LEADS = [0.3, 0, 0.6];
const CHECK_CASES = 8;
const REFINE_CASES = 3;
const PASS_MARGIN = 0.3;
const SIGMA = 6;
const FREE_SIGMA = 15;
const REFINE_ROUNDS = 6;
const REFINE_MS = 6 * 60 * 1000;

export interface MotionInput {
  mj: MainModule;
  model: SimModel;
  poser: Poser;
  spec: TaskSpec;
  environment: Environment;
  stop: () => boolean;
}

export interface MotionPlan {
  controller: SkillController | null;
  reason: string;
}

export function keyAnimation(keys: Key[], options: { lead: number; horizonS: number }): RobotAnimation {
  let last = -1;
  const keyframes = keys.map((k) => {
    const t = Math.max(last + 0.02, k.t - (k.t > 0 ? options.lead : 0), 0);

    last = t;

    return { t, values: k.values };
  });

  return {
    id: 'motion-plan',
    name: 'Motion plan',
    duration: Math.max(options.horizonS, last),
    loop: false,
    interpolation: 'linear',
    keyframes,
  };
}

const controllerOf = (keys: Key[], options: { lead: number; horizonS: number }): SkillController =>
  keys.length === 1
    ? { kind: 'hold', values: keys[0].values }
    : { kind: 'animation', animation: keyAnimation(keys, options) };

const judge = judgeOn;
const better = betterJudged;

async function bestLead(trials: Trials, options: { keys: Key[]; spec: TaskSpec; cases: TrialCase[] }) {
  let best: { lead: number; judged: Judged } | null = null;

  for (const lead of LEADS) {
    const judged = await judge(
      trials,
      controllerOf(options.keys, { lead, horizonS: options.spec.seconds }),
      options.cases,
    );

    if (!best || better(judged, best.judged)) best = { lead, judged };
  }

  return best!;
}

function moving(keys: Key[], rest: JointValues): number[] {
  return keys.flatMap((k, i) => (k.free || Object.keys(k.values).some((id) => k.values[id] !== rest[id]) ? [i] : []));
}

async function refine(
  trials: Trials,
  options: { keys: Key[]; spec: TaskSpec; lead: number; input: MotionInput; rest: JointValues; round: number },
) {
  const { keys, spec, lead, input, round } = options;
  const ids = Object.keys(keys[0].values);
  const free = moving(keys, options.rest);

  if (!free.length) return keys;

  const cases = trials.cases(REFINE_CASES - 1, `refine|${spec.name}|${round}`);
  const unpack = (x: number[]): Key[] =>
    keys.map((k, i) => {
      const slot = free.indexOf(i);

      if (slot < 0) return k;

      return {
        ...k,
        values: Object.fromEntries(ids.map((id, j) => [id, k.values[id] + x[slot * ids.length + j]])),
      };
    });
  const result = await cem({
    mean: new Array(free.length * ids.length).fill(0),
    sigma: free.flatMap((i) => ids.map(() => (keys[i].free ? FREE_SIGMA : SIGMA) / (1 + round))),
    samples: 16,
    elites: 4,
    iterations: 14,
    seed: `${spec.name}|${round}`,
    score: async (x) => (await judge(trials, controllerOf(unpack(x), { lead, horizonS: spec.seconds }), cases)).worst,
    done: (best) => best > 1,
    stop: input.stop,
  });

  return unpack(result.best);
}

async function refined(
  trials: Trials,
  options: {
    keys: Key[];
    spec: TaskSpec;
    lead: number;
    input: MotionInput;
    rest: JointValues;
    first: { judged: Judged };
    cases: TrialCase[];
  },
) {
  const { spec, lead, cases } = options;
  const started = performance.now();
  let best = { keys: options.keys, lead, judged: options.first.judged };

  for (let round = 0; round < REFINE_ROUNDS && !options.input.stop(); round++) {
    const keys = await refine(trials, { ...options, keys: best.keys, round });
    const judged = await judge(trials, controllerOf(keys, { lead, horizonS: spec.seconds }), cases);

    if (better(judged, best.judged)) best = { keys, lead, judged };

    const done = best.judged.passed === cases.length && best.judged.worst >= PASS_MARGIN;

    if (done || performance.now() - started > REFINE_MS) break;
  }

  return best;
}

export async function planMotion(input: MotionInput): Promise<MotionPlan> {
  const { mj, model, poser, spec, environment } = input;
  const statics = new Statics({ mj, model, poser });
  const trials = new Trials({ mj, model, environment });

  try {
    const solved = statics.keyValues(spec.intent).map(({ t, values }) => ({ t, values }));
    const keys = augmented(solved, { model, facts: poser.facts, spec, statics });
    const cases = trials.cases(CHECK_CASES - 1, `check|${spec.name}`);
    const first = await bestLead(trials, { keys, spec, cases });
    const settled = first.judged.passed === cases.length && first.judged.worst >= PASS_MARGIN;
    const plan = settled
      ? { keys, lead: first.lead, judged: first.judged }
      : await refined(trials, { keys, spec, lead: first.lead, input, rest: statics.restValues, first, cases });
    const controller = controllerOf(plan.keys, { lead: plan.lead, horizonS: spec.seconds });
    const reason = `The plan passed ${plan.judged.passed} of ${cases.length} checks before Arena.`;

    return { controller: plan.judged.passed === cases.length ? controller : null, reason };
  } finally {
    statics.dispose();
    trials.dispose();
  }
}
