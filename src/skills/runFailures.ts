import type { SimModel } from '../sim/mjcfTypes';
import { lastError, type ForgeOutcome } from './forgeRunner';
import { refusalModel, type SkillRefusal, type SkillTarget } from './skillRows';

type Report = (target: SkillTarget, refusal: SkillRefusal | null) => void;

export class RunFailures {
  private lines = new Map<SkillTarget, string>();
  private report: Report;

  constructor(report: Report) {
    this.report = report;
  }

  note(target: SkillTarget, outcome: ForgeOutcome, aborted: boolean) {
    if (outcome.ok) this.lines.delete(target);
    else if (!aborted) this.lines.set(target, lastError(outcome));
  }

  lineOr(target: SkillTarget, reason: string) {
    return this.lines.get(target) ?? reason;
  }

  refuse(target: SkillTarget, model: SimModel, line: string) {
    this.report(target, { line, model: refusalModel(model) });
  }

  clear(target: SkillTarget) {
    this.lines.delete(target);
    this.report(target, null);
  }

  forget(target: SkillTarget) {
    this.lines.delete(target);
  }
}
