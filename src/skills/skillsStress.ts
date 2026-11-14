import { plural } from '../../electron/plural.mjs';
import type { SimModel } from '../sim/mjcfTypes';
import { skillHash, type Skill } from './artifacts';
import type { Environment } from './environment';
import type { TrainedEntry } from './kitEnvironment';
import type { SkillRunner } from './skillsClient';
import type { SkillPorts } from './skillsJob';
import { refusedLine, skillRecord, type SkillRecord } from './skillRecords';
import { refusalModel, type SkillRefusal, type SkillTarget } from './skillRows';
import { STRESS_BUDGET, type StressResult } from './stress';
import type { StressTrainOutcome } from './stressTrain';
import { findingText } from './stressWords';

export interface StressRow {
  target: SkillTarget;
  label: string;
}

export interface StressHost {
  runner: SkillRunner;
  startJob: (row: StressRow & { message?: string }, work: (ports: SkillPorts) => Promise<void>) => string | null;
  keep: (target: SkillTarget, record: SkillRecord) => Promise<void>;
  onStressed: (result: StressResult) => void;
  onRefused: (target: SkillTarget, refusal: SkillRefusal | null) => void;
}

export interface StressReport {
  name: string;
  lines: string[];
}

export interface StressSubject {
  skill: Skill;
  environment: Environment;
}

export interface StressTrainSubject extends StressSubject {
  design: string;
  entry: TrainedEntry;
  reward: string;
  result: StressResult;
}

export const STRESSING = 'Stressing';

export function stressLines(result: StressResult): string[] {
  const { findings, rollouts } = result;

  const runs = plural(rollouts, 'run');

  if (!findings.length) return [`No break inside the limits in ${runs}.`];

  return [`${findings.length} found in ${runs}:`, ...findings.map((f) => `- ${findingText(f)}`)];
}

function trainLines(outcome: StressTrainOutcome): string[] {
  if (outcome.kind === 'refused') return [`Refused before training. The old skill stays. ${outcome.reason}`];

  if (outcome.kind === 'dropped') return [`Dropped. The old skill stays. ${outcome.reason}`];

  return [`Kept, and Arena passed it on the wider ranges. ${outcome.evidence.summary}`];
}

export class SkillStress {
  budget = STRESS_BUDGET;
  seed: string | undefined = undefined;
  last: StressReport | null = null;
  private results = new Map<string, StressResult>();
  private host: StressHost;

  constructor(host: StressHost) {
    this.host = host;
  }

  resultOf(hash: string): StressResult | null {
    return this.results.get(hash) ?? null;
  }

  start(model: SimModel, subject: StressSubject, row: StressRow): string | null {
    const { skill, environment } = subject;
    const hash = skillHash(skill);
    const job = { type: 'stress' as const, model, skill, environment, budget: this.budget, seed: this.seed };
    const refused = this.host.startJob({ ...row, message: STRESSING }, async (ports) => {
      const { result } = await this.host.runner(job, ports);

      this.results.set(hash, result);
      this.host.onStressed(result);
      this.last = { name: row.label, lines: stressLines(result) };
    });

    if (!refused) this.results.delete(hash);

    return refused;
  }

  train(model: SimModel, subject: StressTrainSubject, row: StressRow): string | null {
    const { result, ...rest } = subject;
    const job = { type: 'stress-train' as const, model, ...rest, findings: result.findings };

    return this.host.startJob(row, async (ports) => {
      const { outcome } = await this.host.runner(job, ports);

      if (outcome.kind === 'kept') await this.host.keep(row.target, skillRecord(outcome.skill, { kit: subject.entry }));

      if (outcome.kind === 'dropped' && outcome.evidence)
        this.host.onRefused(row.target, { line: refusedLine(outcome.evidence), model: refusalModel(model) });

      this.last = { name: row.label, lines: trainLines(outcome) };
    });
  }
}
