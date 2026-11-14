import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { Skill } from '../skills/artifacts';
import type { Environment } from '../skills/environment';
import { kitEnvironment } from '../skills/kitEnvironment';
import type { SkillRecord } from '../skills/skillRecords';
import type { SkillRow } from '../skills/skillRows';
import { coachReward } from '../skills/skillsCoach';
import { designOf, type SkillsRuntime } from '../skills/skillsRuntime';
import type { StressFinding } from '../skills/stress';

interface StressInput {
  runtime: SkillsRuntime;
  sim: Simulation;
  load: (record: SkillRecord) => Promise<Skill | null>;
  environmentOf: (row: SkillRow) => Environment | null;
  stopReplay: () => void;
}

export const canStress = (row: SkillRow) => row.state.kind === 'ready' && !!row.record;

export const canTrainFindings = (row: SkillRow) =>
  canStress(row) && !!row.kit && !!row.stress?.findings.length && row.record?.hash === row.stress.skill;

const rowOf = (row: SkillRow) => ({ target: row.target, label: row.label });

export function useSkillStress({ runtime, sim, load, environmentOf, stopReplay }: StressInput) {
  const subjectOf = async (row: SkillRow) => {
    const skill = row.record && canStress(row) ? await load(row.record) : null;
    const environment = environmentOf(row);

    return skill && environment ? { skill, environment } : null;
  };

  const start = async (row: SkillRow) => {
    const subject = await subjectOf(row);

    if (!subject) return null;

    return runtime.stress.start(await sim.buildModel(), subject, rowOf(row));
  };

  const train = async (row: SkillRow) => {
    const skill = canTrainFindings(row) ? await load(row.record!) : null;

    if (!skill || !row.kit || !row.stress) return null;

    const built: SimModel = await sim.buildModel();
    const entry = row.kit;
    const subject = {
      skill,
      environment: kitEnvironment(built, entry),
      design: designOf(built),
      entry,
      reward: coachReward(built, row.record!, entry),
      result: row.stress,
    };

    return runtime.stress.train(built, subject, rowOf(row));
  };

  const replay = async (row: SkillRow, finding: StressFinding) => {
    const skill = row.record ? await load(row.record) : null;

    if (!skill || !row.stress) return;

    stopReplay();

    if (sim.status === 'off') await sim.start();

    sim.setController(skill.controller);
    sim.setConditions(finding.point);
    sim.reset(row.stress.start);
  };

  return { canStress, canTrain: canTrainFindings, start, train, replay };
}

export type SkillStressState = ReturnType<typeof useSkillStress>;
