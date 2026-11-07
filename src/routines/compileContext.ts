import { findNode, SENSOR_FACTS } from './nodes';
import type { FactSource, PlanFact } from './planTypes';
import type { Capability, Routine, RoutineError, SkillContract, Step } from './schema';
import { childSequences } from './schema';

export const INFER_FACT_MAX_AGE_MS = 60_000;

export interface CompileOptions {
  skills: readonly SkillContract[];
  provenTransitions?: readonly string[];
  capabilities?: readonly Capability[];
  modelHash?: string;
}

export interface FactInfo extends PlanFact {
  index: number;
  answers?: string[];
}

const DEFAULT_BASE: Record<Step['kind'], (step: Step) => string> = {
  do: (s) => (s as { skill: string }).skill,
  say: () => 'say',
  infer: (s) => (s as { model: string }).model,
  ask: () => 'ask',
  if: () => 'if',
  wait: () => 'wait',
  together: () => 'together',
};

export class CompileContext {
  readonly names = new Map<Step, string>();
  readonly owners = new Map<Step, number>();
  readonly facts = new Map<string, FactInfo>();
  readonly skills = new Map<string, SkillContract>();
  readonly errors: RoutineError[] = [];

  readonly routine: Routine;
  readonly options: CompileOptions;

  constructor(routine: Routine, options: CompileOptions) {
    this.routine = routine;
    this.options = options;

    for (const skill of options.skills) this.skills.set(skill.id, skill);

    this.nameSteps();
    this.collectFacts();
  }

  fail(code: string, message: string, path?: string) {
    if (this.errors.length < 200) this.errors.push({ code, message, ...(path ? { path } : {}) });
  }

  nodeOf(step: Step): string {
    return this.names.get(step) ?? '?';
  }

  private eachOwned(visit: (step: Step, owner: number) => void) {
    const walk = (steps: Step[], owner: number) => {
      for (const step of steps) {
        visit(step, owner);

        for (const child of childSequences(step)) walk(child, owner);
      }
    };

    walk([this.routine.base], -1);
    this.routine.reactions.forEach((r, i) => walk(r.steps, i));
  }

  private nameSteps() {
    const taken = new Set(this.routine.watchers.map((w) => w.id));
    const counts = new Map<string, number>();

    this.eachOwned((step, owner) => {
      this.owners.set(step, owner);

      if (step.id === undefined) return;

      if (taken.has(step.id)) this.fail('duplicate-id', `Two parts of this Routine are called ${step.id}.`);

      taken.add(step.id);
      this.names.set(step, step.id);
    });

    this.eachOwned((step) => {
      if (this.names.has(step)) return;

      const base = DEFAULT_BASE[step.kind](step);
      let n = counts.get(base) ?? 1;
      let name = n === 1 ? base : `${base}${n}`;

      while (taken.has(name)) {
        n += 1;
        name = `${base}${n}`;
      }

      counts.set(base, n);
      taken.add(name);
      this.names.set(step, name);
    });
  }

  private addFact(fact: Omit<FactInfo, 'index'>) {
    this.facts.set(fact.id, { ...fact, index: this.facts.size });
  }

  private collectFacts() {
    for (const w of this.routine.watchers) {
      this.addFact({ id: w.id, type: w.publishes.type, maxAgeMs: w.maxAgeMs, source: 'watcher' });
    }

    this.eachOwned((step) => {
      const source: FactSource | null = step.kind === 'infer' || step.kind === 'ask' ? step.kind : null;

      if (source === null) return;

      const type = step.kind === 'infer' ? step.output.type : 'text';
      const answers = step.kind === 'ask' ? step.answers : undefined;

      this.addFact({ id: this.nodeOf(step), type, maxAgeMs: INFER_FACT_MAX_AGE_MS, source, answers });
    });
  }

  inputType(input: string): string | undefined {
    return this.facts.get(input)?.type ?? SENSOR_FACTS[input]?.type;
  }

  requiresCapability(input: string): string | undefined {
    const sensor = SENSOR_FACTS[input];

    if (!sensor || this.routine.requires.includes(sensor.capability as Capability)) return undefined;

    return sensor.capability;
  }

  nodeLabel(model: string): string {
    return findNode(model)?.label ?? model;
  }
}
