import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { skillHash, type ArenaEvidence, type Skill } from './artifacts';
import { validateEnvironment, type Environment, type SkillStates } from './environment';
import { lastError, runCounted, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import { kitRobot } from './kitModel';
import { moveJob } from './moveJob';
import { moveSchedule } from './moveSchedule';
import { proveSkill } from './prove';

export interface HandoffTraining {
  mj: MainModule;
  model: SimModel;
  design: string;
  target: Skill;
  environment: Environment;
  states: SkillStates;
  forge: ForgeRunner;
  save: SkillSave;
  seed?: number;
}

export interface HandoffCandidate {
  skill: Skill | null;
  evidence: ArenaEvidence | null;
  reason: string;
}

export const canTrainHandoff = (environment: Environment | null) => !!environment?.reference;

export function forgeStartStates(model: SimModel, states: SkillStates) {
  const at = kitRobot(model).joints.map((id) => states.joints.indexOf(id));

  if (at.some((i) => i < 0)) throw new Error('The start states miss a joint the trainer moves.');

  return states.samples.map((s) => ({
    joints: at.map((i) => s.joints[i]),
    jointVels: at.map((i) => s.jointVels[i]),
    height: s.height,
    quat: s.quat,
    linear: s.linear,
    angular: s.angular,
  }));
}

export function handoffJob(model: SimModel, environment: Environment, options: { target: Skill; seed: number }) {
  const states = environment.reset.states;

  if (!states || !canTrainHandoff(environment)) throw new Error('Only a move retrains for a hand-off.');

  const { minutes, delaySteps } = moveSchedule(model).at(-1)!.stages[0];
  const { target, seed } = options;
  const job = moveJob(model, environment, { name: target.name, minutes, seed, delaySteps });
  const cpu: Record<string, unknown> = { ...job };

  delete cpu.backend;
  delete cpu.gpuEnvs;

  const warm = target.controller.kind === 'policy' ? { warmPolicy: target.controller.policy } : {};

  return { ...cpu, name: `Hand-off: ${target.name}`, startStates: forgeStartStates(model, states), ...warm };
}

export async function trainHandoffSkill(input: HandoffTraining): Promise<HandoffCandidate> {
  const { mj, model, target, environment, states } = input;
  const training: Environment = { ...environment, reset: { ...environment.reset, states } };
  const problems = await validateEnvironment(training, model);

  if (problems.length) return { skill: null, evidence: null, reason: problems.join(' ') };

  const job = handoffJob(model, training, { target, seed: input.seed ?? 1 });
  const tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  const outcome = await runCounted(input.forge, { name: job.name, xml: model.xml, job }, tally);

  if (!outcome.ok || !outcome.policy) return { skill: null, evidence: null, reason: lastError(outcome) };

  const proof = await proveSkill({
    mj,
    model,
    design: input.design,
    name: target.name,
    environment,
    controller: { kind: 'policy', policy: outcome.policy, robot: kitRobot(model).key },
    save: input.save,
    origin: () => ({ method: target.origin?.method ?? 'tracking', cost: { wallS: 0, steps: tally.steps } }),
    ...(target.controller.kind === 'policy' ? { warmStartFrom: skillHash(target) } : {}),
  });

  return { skill: proof.skill, evidence: proof.evidence, reason: proof.evidence.summary };
}
