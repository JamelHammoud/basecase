import { routineBody, type RoutineBody } from '../routines/physicsBody';
import type { RoutineKit } from '../routines/physicsKit';
import type { Plan } from '../routines/planTypes';
import type { SkillContract } from '../routines/schema';
import type { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { caseSignalNames, sampleSignals, type CaseFactReader } from './caseFacts';
import { CaseLogicRun, compileCaseLogic, type CaseInput } from './caseLogic';
import type { RobotJoint } from '../types/robotics';
import type { Case } from './schema';

export interface LogicOptions {
  kit?: RoutineKit;
  skills?: readonly SkillContract[];
  inputs?: CaseInput[];
}

export function bodyFor(model: SimModel, joints: RobotJoint[], options: LogicOptions) {
  const kit = options.kit;

  return routineBody(model, joints, { skills: kit?.policies ?? [], drive: kit?.drive }) ?? undefined;
}

type LogicPlan = { plan: Plan | null; refusal?: string };

export function logicPlan(kase: Case, options: LogicOptions): LogicPlan {
  if (!kase.logic) return { plan: null };

  const skills = options.skills ?? options.kit?.skills ?? [];
  const compiled = compileCaseLogic(kase.logic, { skills, modelHash: options.kit?.modelHash });

  return compiled.ok ? { plan: compiled.plan } : { plan: null, refusal: compiled.errors[0].message };
}

interface LogicStart {
  plan: Plan | null;
  kase: Case;
  engine: SimEngine;
  body: RoutineBody | null;
  handBack: () => void;
  inputs?: CaseInput[];
}

export async function startLogic({ plan, kase, engine, body, handBack, inputs }: LogicStart) {
  if (!plan) return null;

  const logic = await CaseLogicRun.start({ plan, seconds: kase.task.seconds, engine, body, handBack });

  for (const event of inputs ?? []) logic.input(event);

  return logic;
}

export type Signals = Record<string, number[]>;

type ProbeSample = (poses: Float64Array, out: Signals) => void;

export function factSampler(kase: Case, facts: CaseFactReader, reader: { sample: ProbeSample }, signals: Signals) {
  const names = caseSignalNames(kase);

  return (poses: Float64Array, t: number, torque?: number) => {
    const read = facts.read(poses, t, torque);

    reader.sample(poses, signals);
    sampleSignals(read, names, signals);

    return read;
  };
}
