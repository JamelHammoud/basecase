import type { SimEngine } from '../sim/engine';
import { compileRoutine, type CompileResult } from '../routines/compile';
import { applyControl, type BodyControl, controlFor, type RoutineBody, SKILL_SECONDS } from '../routines/physicsBody';
import { MASK, type Plan } from '../routines/planTypes';
import { startScenario, type ScenarioRig } from '../routines/scenario';
import { SKILL_MS } from '../routines/scenarioMocks';
import type { TraceEvent } from '../routines/scenarioTypes';
import type { Capability, Routine, SkillContract } from '../routines/schema';
import { evaluateContract, type Contract, type Trace } from '../skills/contract';
import type { CaseFacts, FactValue } from './caseFacts';

export const DRIVE_SKILL = 'drive';

export const CASE_DRIVE: SkillContract = {
  id: DRIVE_SKILL,
  status: 'ready',
  rateHz: 50,
  holds: ['body'],
  startsFrom: ['any'],
  endsIn: 'any',
  interrupt: 'any',
  stopVia: DRIVE_SKILL,
  transitions: {},
};

export interface CaseInput {
  at: number;
  name: string;
  value: FactValue;
}

export interface LogicSkills {
  skills: readonly SkillContract[];
  modelHash?: string;
  capabilities?: readonly Capability[];
}

export interface CaseLogicResult {
  trace: TraceEvent[];
  said: string[];
  facts: CaseFacts;
}

export function compileCaseLogic(logic: Routine, options: LogicSkills): CompileResult {
  const skills = [...options.skills.filter((s) => s.id !== DRIVE_SKILL), CASE_DRIVE];

  return compileRoutine(logic, { ...options, skills });
}

export const usesBodySkills = (plan: Plan) =>
  plan.skills.some((s) => s.id !== DRIVE_SKILL && (s.holds & MASK.body) !== 0);

const factId = (label: string) =>
  `failed-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

export async function judgeSoFar(contract: Contract, trace: Trace): Promise<CaseFacts> {
  const verdict = await evaluateContract(contract, trace).catch(() => null);

  if (!verdict) return {};

  const failed = new Set(verdict.failed);

  return {
    passed: verdict.passed,
    ...Object.fromEntries(contract.failures.map((f) => [factId(f.label), failed.has(f.label)])),
  };
}

export interface CaseLogicInput {
  plan: Plan;
  seconds: number;
  engine: SimEngine;
  handBack: () => void;
  body: RoutineBody | null;
}

type Skills = { body: string | null; head: string | null };

export class CaseLogicRun {
  private readonly rig: ScenarioRig;
  private readonly engine: SimEngine;
  private readonly body: RoutineBody | null;
  private readonly handBack: () => void;
  private readonly inputs: CaseInput[] = [];
  private facts: CaseFacts = {};
  private factsAt = 0;
  private control: BodyControl | null = null;
  driving = true;

  private constructor(input: CaseLogicInput, rig: ScenarioRig) {
    this.rig = rig;
    this.engine = input.engine;
    this.body = input.body;
    this.handBack = input.handBack;
    rig.host.skillLatency = (skill) => (SKILL_SECONDS[skill] ?? SKILL_MS / 1000) * 1000;
    rig.host.feed = (fact, atMs) => this.fed(fact, atMs);
    rig.control.onChange = (skills) => this.take(skills);
  }

  static async start(input: CaseLogicInput): Promise<CaseLogicRun> {
    const scenario = { covers: 'case', world: [], mocks: {}, faults: [], seconds: input.seconds, expect: [] };

    return new CaseLogicRun(input, await startScenario(input.plan, scenario));
  }

  input(event: CaseInput) {
    this.inputs.push(event);
  }

  private fed(fact: string, atMs: number) {
    for (let i = this.inputs.length - 1; i >= 0; i--) {
      const event = this.inputs[i];

      if (event.name === fact && event.at * 1000 <= atMs) return { value: event.value, at: event.at * 1000 };
    }

    const value = this.facts[fact];

    return value === undefined ? undefined : { value, at: this.factsAt };
  }

  private take(skills: Skills) {
    const toDrive = skills.body === null || skills.body === DRIVE_SKILL;

    if (toDrive || !this.body) return this.backToDrive();

    const next = controlFor(this.body, skills);

    applyControl(this.engine, next, this.control);
    this.control = next;
    this.driving = false;
  }

  private backToDrive() {
    if (!this.driving) this.handBack();

    this.driving = true;
    this.control = null;
  }

  advance(atMs: number, facts: CaseFacts) {
    this.facts = { ...this.facts, ...facts };
    this.factsAt = atMs;
    this.rig.clock.runUntil(atMs);
  }

  judged(facts: CaseFacts) {
    this.facts = { ...this.facts, ...facts };
  }

  result(): CaseLogicResult {
    return { trace: this.rig.host.trace, said: this.rig.host.said, facts: { ...this.facts } };
  }
}
