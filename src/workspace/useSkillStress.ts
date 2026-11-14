import { useEffect, useState } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { Skill } from '../skills/artifacts';
import type { Environment } from '../skills/environment';
import type { SkillRow } from '../skills/skillRows';
import { designOf, type SkillsRuntime } from '../skills/skillsRuntime';
import type { StressFinding } from '../skills/stress';
import { stressStartPose } from '../skills/stressJudge';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';

interface StressInput {
  runtime: SkillsRuntime;
  sim: Simulation;
  model: SimModel | null;
  load: (row: SkillRow) => Promise<Skill | null>;
  environmentOf: (row: SkillRow, model: SimModel) => Environment | null;
  stopReplay: () => void;
  busy: boolean;
}

export const canStress = (row: SkillRow) => row.state.kind === 'ready' && !!row.record;

export const canTrainOnStress = (row: SkillRow) =>
  !IS_WEB_DEMO && canStress(row) && !!row.kit && !!row.stress?.result.findings.length;

export function useSkillStress({ runtime, sim, model, load, environmentOf, stopReplay, busy }: StressInput) {
  const [, setVersion] = useState(0);

  useEffect(() => runtime.stress.subscribe(() => setVersion((v) => v + 1)), [runtime]);

  const subject = async (row: SkillRow) => {
    const built = await sim.buildModel();
    const skill = canStress(row) ? await load(row) : null;
    const environment = skill ? environmentOf(row, built) : null;

    return skill && environment ? { built, skill, environment } : null;
  };

  const stress = async (row: SkillRow) => {
    const found = await subject(row);

    if (!found) return null;

    const { built, skill, environment } = found;

    return runtime.stress.start(built, row, { skill, environment, entry: row.kit });
  };

  const train = async (row: SkillRow) => {
    const found = canTrainOnStress(row) ? await subject(row) : null;

    if (!found) return null;

    const { built, skill, environment } = found;

    return runtime.stress.train(built, row, { skill, environment, entry: row.kit, design: designOf(built) });
  };

  const replay = async (row: SkillRow, finding: StressFinding) => {
    const skill = await load(row);
    const environment = model ? environmentOf(row, model) : null;
    const start = row.stress?.result.start;

    if (!skill || !environment || !model || !start) return;

    stopReplay();

    if (sim.status === 'off') await sim.start();

    sim.setController(skill.controller, finding.replay);
    sim.reset(stressStartPose(model, { environment, start }));
  };

  return {
    of: (row: SkillRow) => runtime.stress.of(row.target, row.record?.hash),
    canStress: (row: SkillRow) => !busy && canStress(row),
    canTrain: (row: SkillRow) => !busy && canTrainOnStress(row),
    stress,
    train,
    replay,
    setBudget: (budget: number | null) => runtime.stress.setBudget(budget),
  };
}

export type SkillStressState = ReturnType<typeof useSkillStress>;
