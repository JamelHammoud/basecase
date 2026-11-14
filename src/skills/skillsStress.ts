import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from './artifacts';
import type { Environment } from './environment';
import type { TrainedEntry } from './kitEnvironment';
import type { SkillRunner } from './skillsClient';
import type { SkillPorts } from './skillsJob';
import { refusedLine, skillRecord, type SkillRecord } from './skillRecords';
import type { SkillTarget } from './skillRows';
import type { StressResult } from './stress';
import type { StressTrainOutcome } from './stressTrain';

export const STRESSING = 'Stressing';

export interface StressReport {
  skill: string;
  result: StressResult;
  refused: string | null;
}

export interface StressRow {
  target: SkillTarget;
  label: string;
}

export interface StressSubject {
  skill: Skill;
  environment: Environment;
}

export interface StressRetrain extends StressSubject {
  design: string;
  entry: TrainedEntry;
  record: SkillRecord;
  reward?: string;
}

export interface StressHost {
  runner: SkillRunner;
  startJob: (row: StressRow & { message?: string }, work: (ports: SkillPorts) => Promise<void>) => string | null;
  keep: (target: SkillTarget, record: SkillRecord) => Promise<void>;
  onStress: (target: SkillTarget, report: StressReport | null) => void;
}

export interface StressTrainReport {
  name: string;
  kept: boolean;
  line: string;
}

const NOTHING_FOUND = 'Stress found nothing to train on. Run Stress first.';

function trainLine(outcome: StressTrainOutcome): string {
  if (outcome.kind === 'kept') return `Kept, and Arena passed the wider ranges. ${outcome.evidence.summary}`;

  if (outcome.kind === 'refused') return `Refused before training; the old skill stays. ${outcome.reason}`;

  return `Dropped; the old skill stays. ${outcome.reason}`;
}

const rowLine = (outcome: Exclude<StressTrainOutcome, { kind: 'kept' }>) =>
  outcome.kind === 'dropped' && outcome.evidence ? refusedLine(outcome.evidence) : outcome.reason;

export class SkillStress {
  lastTrain: StressTrainReport | null = null;
  private reports = new Map<SkillTarget, StressReport>();
  private host: StressHost;

  constructor(host: StressHost) {
    this.host = host;
  }

  reportOf(target: SkillTarget): StressReport | null {
    return this.reports.get(target) ?? null;
  }

  run(model: SimModel, row: StressRow, subject: StressSubject & { budget?: number }): string | null {
    const { skill, environment, budget } = subject;

    return this.host.startJob({ ...row, message: STRESSING }, async (ports) => {
      const { result } = await this.host.runner({ type: 'stress', model, skill, environment, budget }, ports);

      this.set(row.target, { skill: result.skill, result, refused: null });
    });
  }

  train(model: SimModel, row: StressRow, job: StressRetrain): string | null {
    const report = this.reports.get(row.target);

    if (!report?.result.findings.length) return NOTHING_FOUND;

    const { record, ...rest } = job;
    const busy = this.host.startJob(row, async (ports) => {
      const { outcome } = await this.host.runner(
        { type: 'stress-train', model, ...rest, findings: report.result.findings },
        ports,
      );

      this.lastTrain = { name: row.label, kept: outcome.kind === 'kept', line: trainLine(outcome) };

      if (outcome.kind !== 'kept') return this.set(row.target, { ...report, refused: rowLine(outcome) });

      this.set(row.target, null);
      await this.host.keep(
        row.target,
        skillRecord(outcome.skill, { kit: job.entry, coach: record.coach ?? undefined }),
      );
    });

    if (!busy) this.lastTrain = null;

    return busy;
  }

  private set(target: SkillTarget, report: StressReport | null) {
    if (report) this.reports.set(target, report);
    else this.reports.delete(target);

    this.host.onStress(target, report);
  }
}
