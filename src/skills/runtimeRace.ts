import type { SimModel } from '../sim/mjcfTypes';
import type { SkillRunner } from './skillsClient';
import type { SkillPorts } from './skillsJob';
import type { DraftReport } from './teach';
import { raceSummary } from './teach';
import { skillRecord, type SkillRecord } from './skillRecords';
import type { RaceReport } from './skillsRuntimeTypes';
import type { SkillTarget } from './skillRows';

export async function runTaughtRace(input: {
  model: SimModel;
  report: DraftReport;
  budgetSteps?: number;
  ports: SkillPorts;
  runner: SkillRunner;
  assertCurrent: () => void;
  keep: (target: SkillTarget, record: SkillRecord, assertCurrent: () => void) => Promise<void>;
  onRace: (report: RaceReport) => void;
}) {
  const { draft } = input.report;
  const assertCurrent = input.assertCurrent;
  const save: SkillPorts['save'] = async (path, text) => {
    assertCurrent();
    await input.ports.save(path, text);
    assertCurrent();
  };

  assertCurrent();

  const reply = await input.runner(
    { type: 'race', model: input.model, draft, budgetSteps: input.budgetSteps },
    { ...input.ports, save },
  );
  const outcome = reply.outcome;

  assertCurrent();

  if (outcome.kind === 'skill')
    await input.keep(
      `goal:${draft.name}`,
      skillRecord(outcome.skill, { kit: null, goal: draft.request, environment: draft.environment }),
      assertCurrent,
    );

  assertCurrent();
  input.onRace({
    name: draft.name,
    found: outcome.kind === 'skill',
    lines: raceSummary(outcome),
    relaxation: outcome.kind === 'skill' ? null : input.report.relaxation,
  });
}
