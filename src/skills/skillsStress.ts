import type { SimModel } from '../sim/mjcfTypes';
import { skillHash, type Skill } from './artifacts';
import type { Environment } from './environment';
import type { TrainedEntry } from './kitEnvironment';
import type { SkillRunner } from './skillsClient';
import type { SkillPorts } from './skillsJob';
import { refusedLine, skillRecord, type SkillRecord } from './skillRecords';
import type { SkillTarget } from './skillRows';
import type { StressResult } from './stress';

export interface StressHost {
  runner: SkillRunner;
  startJob: (
    row: { target: SkillTarget; label: string; message?: string },
    work: (ports: SkillPorts) => Promise<void>,
  ) => string | null;
  keep: (target: SkillTarget, record: SkillRecord) => Promise<void>;
}

export interface StressState {
  result: StressResult;
  refused: string | null;
}

export interface StressSubject {
  skill: Skill;
  environment: Environment;
  entry: TrainedEntry | null;
}

interface Row {
  target: SkillTarget;
  label: string;
}

const MESSAGE = 'Stressing';

export class SkillStress {
  private budget: number | null = null;
  private results = new Map<SkillTarget, StressState>();
  private listeners = new Set<() => void>();
  private host: StressHost;

  constructor(host: StressHost) {
    this.host = host;
  }

  setBudget(budget: number | null) {
    this.budget = budget;
  }

  subscribe(listen: () => void) {
    this.listeners.add(listen);

    return () => {
      this.listeners.delete(listen);
    };
  }

  of(target: SkillTarget, skill: string | undefined): StressState | null {
    const state = this.results.get(target);

    return state && state.result.skill === skill ? state : null;
  }

  private set(target: SkillTarget, state: StressState) {
    this.results.set(target, state);
    this.listeners.forEach((listen) => listen());
  }

  start(model: SimModel, row: Row, subject: StressSubject): string | null {
    const { skill, environment } = subject;
    const budget = this.budget ?? undefined;

    return this.host.startJob({ ...row, message: MESSAGE }, async (ports) => {
      const reply = await this.host.runner({ type: 'stress', model, skill, environment, budget }, ports);

      this.set(row.target, { result: reply.result, refused: null });
    });
  }

  train(model: SimModel, row: Row, subject: StressSubject & { design: string }): string | null {
    const { skill, environment, entry, design } = subject;
    const state = this.of(row.target, skillHash(skill));

    if (!state?.result.findings.length || !entry) return 'Stress a ready Motor Kit skill first.';

    const findings = state.result.findings;

    return this.host.startJob(row, async (ports) => {
      const job = { type: 'stress-train' as const, model, design, entry, skill, environment, findings };
      const { outcome } = await this.host.runner(job, ports);

      if (outcome.kind === 'kept') return this.host.keep(row.target, skillRecord(outcome.skill, { kit: entry }));

      const refused = outcome.evidence ? refusedLine(outcome.evidence) : outcome.reason;

      this.set(row.target, { ...state, refused });
    });
  }
}
