import type { SimModel } from '../sim/mjcfTypes';
import { skillHash, type Skill } from './artifacts';
import type { CoachBrief, CoachOutcome } from './coach';
import { signalNumber } from './coachSignals';
import type { TrainedEntry } from './kitEnvironment';
import { kitReward } from './kitRewards';
import type { SkillRunner } from './skillsClient';
import type { CoachJob, CoachSubjectJob, SkillPorts } from './skillsJob';
import { skillRecord, type CoachTag, type SkillRecord } from './skillRecords';
import type { SkillTarget } from './skillRows';

export interface CoachReport {
  name: string;
  kept: boolean;
  lines: string[];
}

export interface CoachHost {
  runner: SkillRunner;
  ports: () => SkillPorts;
  startJob: (row: { target: SkillTarget; label: string }, work: (ports: SkillPorts) => Promise<void>) => string | null;
  keep: (target: SkillTarget, record: SkillRecord) => Promise<void>;
}

export const coachReward = (model: SimModel, record: SkillRecord, entry: TrainedEntry) =>
  record.coach?.reward ?? kitReward(model, entry);

function reportLines(outcome: CoachOutcome): string[] {
  if (outcome.kind === 'refused') return [`Refused before training; the old skill stays. ${outcome.reason}`];

  const { signal, before, after } = outcome.change;
  const moved =
    after === null ? [] : [`${signal}: ${signalNumber(signal, before)} before, ${signalNumber(signal, after)} after.`];

  if (outcome.kind === 'dropped') return [`Dropped; the old skill stays. ${outcome.reason}`, ...moved];

  return [`Kept, and Arena passed the same contract. ${outcome.evidence.summary}`, ...moved];
}

export class SkillCoach {
  last: CoachReport | null = null;
  private briefs = new Map<string, CoachBrief>();
  private host: CoachHost;

  constructor(host: CoachHost) {
    this.host = host;
  }

  briefOf(skill: Skill): CoachBrief | null {
    return this.briefs.get(skillHash(skill)) ?? null;
  }

  async brief(model: SimModel, subject: CoachSubjectJob): Promise<CoachBrief> {
    const reply = await this.host.runner({ type: 'coach-brief', model, ...subject }, this.host.ports());

    this.briefs.set(reply.brief.skill, reply.brief);

    return reply.brief;
  }

  start(model: SimModel, job: CoachJob & { words: string }, row: { target: SkillTarget; label: string }) {
    const { words, ...rest } = job;

    const busy = this.host.startJob(row, async (ports) => {
      const { outcome } = await this.host.runner({ type: 'coach', model, ...rest }, ports);

      if (outcome.kind === 'kept') {
        const { signal, direction, before, after } = outcome.change;
        const coach: CoachTag = {
          words,
          reward: job.revision.reward,
          signal,
          direction,
          before,
          after,
          from: job.brief.skill,
        };

        await this.host.keep(row.target, skillRecord(outcome.skill, { kit: job.entry, coach }));
      }

      this.last = { name: row.label, kept: outcome.kind === 'kept', lines: reportLines(outcome) };
    });

    if (!busy) this.last = null;

    return busy;
  }
}
