import { useState } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { Skill } from '../skills/artifacts';
import type { Environment } from '../skills/environment';
import { kitEnvironment } from '../skills/kitEnvironment';
import type { SkillRow } from '../skills/skillRows';
import { coachReward } from '../skills/skillsCoach';
import { designOf, type SkillsRuntime } from '../skills/skillsRuntime';
import { STRESS_BUDGET, type StressAxisResult } from '../skills/stress';
import { trainingProblem } from './trainingProblem';

interface StressInput {
  sim: Simulation;
  runtime: SkillsRuntime;
  loadSkill: (hash: string) => Promise<Skill | null>;
  environmentOf: (row: SkillRow) => Environment | null;
}

const MISSING = 'This skill’s file is missing. Train it again.';

export const canStress = (row: SkillRow) => row.state.kind === 'ready' && !!row.record;

export const canTrainOnFindings = (row: SkillRow) =>
  !!row.kit && canStress(row) && !!row.stress?.result.findings.length;

async function subjectOf(row: SkillRow, input: StressInput) {
  const skill = row.record ? await input.loadSkill(row.record.hash) : null;
  const environment = input.environmentOf(row);

  return skill && environment ? { skill, environment } : null;
}

export function useSkillStress(input: StressInput) {
  const { sim, runtime } = input;
  const [budget, setBudget] = useState(STRESS_BUDGET);

  const run = (row: SkillRow) =>
    trainingProblem(runtime, async () => {
      const subject = await subjectOf(row, input);

      if (!subject) return MISSING;

      return runtime.stress.run(await sim.buildModel(), row, { ...subject, budget });
    });

  const train = (row: SkillRow) =>
    trainingProblem(runtime, async () => {
      const subject = await subjectOf(row, input);

      if (!subject || !row.kit || !row.record) return MISSING;

      const model: SimModel = await sim.buildModel();
      const entry = row.kit;

      return runtime.stress.train(model, row, {
        skill: subject.skill,
        environment: kitEnvironment(model, entry),
        design: designOf(model),
        entry,
        record: row.record,
        reward: coachReward(model, row.record, entry),
      });
    });

  const replay = async (row: SkillRow, finding: StressAxisResult) => {
    const skill = row.record ? await input.loadSkill(row.record.hash) : null;
    const start = row.stress?.result.start;

    if (!skill || !start) return;

    if (sim.status === 'off') await sim.start();

    sim.setPhysics(finding.run);
    sim.setController(skill.controller);
    sim.resetTo(start);
  };

  return { run, train, replay, budget, setBudget };
}

export type SkillStressState = ReturnType<typeof useSkillStress>;
