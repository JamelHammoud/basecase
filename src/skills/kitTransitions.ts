import type { MainModule } from '@mujoco/mujoco';
import { modelHashes, type Skill } from './artifacts';
import type { DriveSetup } from '../sim/drive';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { routineBody, type RoutineBody } from '../routines/physicsBody';
import { atHandoffPhase, PROOF_SEEDS, Prover } from '../routines/physicsProver';
import { KIT_PAIRS, kitPairCases, type KitPairCase } from '../routines/kitPairProof';
import { kitBehavior, kitFailure } from '../routines/kitBehavior';
import { hashOf } from './hash';
import type { SkillStates } from './environment';
import type { TrainedEntry } from './kitEnvironment';
import { kitBackSpeed } from './kitModel';

export interface KitContext {
  skills?: readonly Skill[];
  drive?: DriveSetup | null;
}

export interface KitTransitionInput extends KitContext {
  mj: MainModule;
  model: SimModel;
  entry: TrainedEntry;
  policy: PolicySpec;
  reverse?: boolean;
}

export interface KitTransitionCheck extends KitPairCase {
  seeds: number;
  falls: number;
  failures: number;
}

export interface KitTransitionEvidence {
  binding: { physics: string; actuators: string; controllers: string };
  checks: KitTransitionCheck[];
  passed: boolean;
  reason: string;
}

export interface KitSkill extends Skill {
  kitValidation?: KitTransitionEvidence;
}

export interface KitTransitionReport extends KitTransitionEvidence {
  starts: SkillStates;
  wallS: number;
  simulatedS: number;
}

export function transitionEvidence(report: KitTransitionReport): KitTransitionEvidence {
  const { binding, checks, passed, reason } = report;

  return { binding, checks, passed, reason };
}

function checksFor(input: KitTransitionInput, body: RoutineBody): KitPairCase[] {
  const checks = KIT_PAIRS.flatMap(([from, to]) => kitPairCases({ from, to }));

  if (input.entry === 'settle-to-neutral')
    return body.policies.velocity || body.drive ? checks.filter((c) => c.to === 'settle') : [];

  if (input.entry !== 'velocity-tracking') return [];

  const reverse: KitPairCase[] = input.reverse
    ? [{ from: 'settle', to: 'walk', toMove: { distance: -1, speed: kitBackSpeed(input.model) } }]
    : [];

  return [...checks, ...reverse];
}

function bodyFor(input: KitTransitionInput): RoutineBody {
  const body = routineBody(input.model, [], { skills: input.skills ?? [], drive: input.drive });

  if (!body) throw new Error('The Motor Kit needs a robot with joints.');

  if (input.entry === 'velocity-tracking') body.policies.velocity = input.policy;

  if (input.entry === 'settle-to-neutral') body.policies.settle = input.policy;

  return body;
}

export function kitTransitionReport(input: KitTransitionInput): KitTransitionReport {
  const started = performance.now();
  const body = bodyFor(input);
  const prover = new Prover(input.mj, body);
  const checks: KitTransitionCheck[] = [];
  let simulatedS = 0;
  const starts: SkillStates = { skill: 'motor-kit', joints: input.model.joints.map((j) => j.id), samples: [] };

  try {
    for (const check of checksFor(input, body)) {
      const run = prover.run(check.from, check.to, atHandoffPhase(check.from), check);
      const failed = run.sampled.map((sample) => !kitBehavior(check.to, sample, check.toMove));

      checks.push({ ...check, seeds: PROOF_SEEDS, falls: run.falls, failures: failed.filter(Boolean).length });
      starts.samples.push(...run.starts.filter((_, i) => failed[i] || run.falls > 0));
      simulatedS += run.simulatedS;
    }
  } finally {
    prover.dispose();
  }

  const bad = checks.find((c) => c.falls || c.failures);
  const { physics, actuators } = modelHashes(input.model);
  const reason = bad ? failureReason(bad) : '';

  return {
    binding: { physics, actuators, controllers: hashOf({ policies: body.policies, drive: body.drive }) },
    checks,
    passed: !bad,
    reason,
    starts,
    wallS: (performance.now() - started) / 1000,
    simulatedS,
  };
}

function failureReason(check: KitTransitionCheck): string {
  if (check.falls) return `${check.from} to ${check.to} fell in ${check.falls} of ${check.seeds} tries in simulation.`;

  return kitFailure(check, check.failures, check.seeds);
}

export const transitionScore = (report: KitTransitionEvidence) =>
  report.checks.length ? Math.min(...report.checks.map((c) => 1 - Math.max(c.falls, c.failures) / c.seeds)) : 1;
