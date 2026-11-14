import { useEffect, useEffectEvent, useState } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { Skill } from '../skills/artifacts';
import type { SkillRecord } from '../skills/skillRecords';
import type { SkillRow, SkillTarget } from '../skills/skillRows';
import type { SkillsRuntime } from '../skills/skillsRuntime';
import { STRESS_BUDGET, stressBudget, type StressFinding } from '../skills/stress';
import { rowEnvironment, stressTargetOf, type StressRow } from '../skills/stressRuns';
import type { RobotAnimation } from '../types/robotics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';

let nextBudget = STRESS_BUDGET;

export const setStressBudget = (rollouts: number) => {
  nextBudget = stressBudget(rollouts);
};

interface StressInput {
  runtime: SkillsRuntime;
  sim: Simulation;
  rows: SkillRow[];
  animations: RobotAnimation[];
  load: (record: SkillRecord) => Promise<Skill | null>;
  showToast: (message: string) => void;
}

type Load = StressInput['load'];

function usePolicyRows(rows: SkillRow[], load: Load) {
  const [policies, setPolicies] = useState<Record<string, boolean>>({});
  const unknown = rows.flatMap((r) =>
    r.findings.length && r.record && !(r.record.hash in policies) ? [r.record] : [],
  );
  const key = unknown.map((r) => r.hash).join(' ');
  const learn = useEffectEvent(() => {
    for (const record of unknown)
      void load(record)
        .catch(() => null)
        .then((skill) => setPolicies((known) => ({ ...known, [record.hash]: skill?.controller.kind === 'policy' })));
  });

  useEffect(() => {
    if (key) learn();
  }, [key]);

  return policies;
}

const missing = (row: SkillRow) => `${row.label}’s saved skill is missing.`;

export function useSkillStress(input: StressInput) {
  const { runtime, sim, load, showToast } = input;
  const policies = usePolicyRows(input.rows, load);

  const prepared = async (row: SkillRow): Promise<{ model: SimModel; ready: StressRow } | null> => {
    const record = row.state.kind === 'ready' ? row.record : null;

    if (!record) return null;

    const model = await sim.buildModel();
    const skill = await load(record);
    const scene = { model, animations: input.animations, drafted: (t: SkillTarget) => runtime.environmentOf(t) };
    const environment = rowEnvironment(row, scene);

    return skill && environment
      ? { model, ready: { target: row.target, label: row.label, record, skill, environment } }
      : null;
  };

  const stress = async (row: SkillRow) => {
    const found = await prepared(row);

    if (!found) return showToast(missing(row));

    const result = await runtime.stress(found.model, found.ready, nextBudget);

    if (typeof result === 'string') showToast(result);
  };

  const replayFinding = async (row: SkillRow, finding: StressFinding) => {
    const skill = row.record ? await load(row.record) : null;

    if (!skill) return;

    if (sim.status === 'off') await sim.start();

    sim.setPhysics(finding.point);
    sim.setController(skill.controller);
    sim.reset(finding.start);
  };

  const trainOnFindings = async (row: SkillRow) => {
    const kind = stressTargetOf(row);
    const found = kind && (await prepared(row));

    if (!kind || !found) return showToast(missing(row));

    const busy = runtime.busy;
    const result = await runtime.trainOnStress(found.model, found.ready, kind);

    if (typeof result === 'string') showToast(busy ? result : `Kept the old ${row.label}. ${result}`);
  };

  const canTrainOnFindings = (row: SkillRow) =>
    !IS_WEB_DEMO && !!stressTargetOf(row) && row.findings.length > 0 && policies[row.record?.hash ?? ''] === true;

  return { stress, replayFinding, trainOnFindings, canTrainOnFindings };
}

export type SkillStress = ReturnType<typeof useSkillStress>;
