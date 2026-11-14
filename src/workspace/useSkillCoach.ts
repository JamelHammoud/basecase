import { useRef, useState } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { Skill } from '../skills/artifacts';
import { kitEnvironment } from '../skills/kitEnvironment';
import { recordFreshness, withRecord, type SkillRecord } from '../skills/skillRecords';
import type { SkillRow, SkillTarget } from '../skills/skillRows';
import { designOf } from '../skills/skillsRuntime';
import type { ProjectSettings } from '../types/robotics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';

export interface CoachScope {
  target: SkillTarget;
  label: string;
}

interface CoachInput {
  sim: Simulation;
  model: SimModel | null;
  records: SkillRecord[];
  loadSkill: (hash: string) => Promise<Skill | null>;
  setProject: (update: (p: ProjectSettings) => ProjectSettings) => void;
}

export const canCoach = (row: SkillRow) => !IS_WEB_DEMO && !!row.kit && row.state.kind === 'ready' && !!row.record;

function previousOf(row: SkillRow, records: SkillRecord[], model: SimModel | null) {
  const previous = records.find((r) => r.hash === row.record?.coach?.from);

  if (!previous || !model) return null;

  return recordFreshness(previous, { model, design: designOf(model) }) === 'fresh' ? previous : null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useSkillCoach({ sim, model, records, loadSkill, setProject }: CoachInput) {
  const [scope, setScope] = useState<CoachScope | null>(null);
  const replaying = useRef(0);

  const play = async (skill: Skill) => {
    if (sim.status === 'off') await sim.start();

    sim.setConditions(null);
    sim.setController(skill.controller);
    sim.reset();
  };

  const replay = async (row: SkillRow) => {
    const from = row.record?.coach?.from;

    if (!from || !row.kit || !model) return;

    const [before, after] = await Promise.all([loadSkill(from), loadSkill(row.record!.hash)]);
    const run = ++replaying.current;

    if (!before || !after) return;

    await play(before);
    await wait(kitEnvironment(model, row.kit).horizonS * 1000);

    if (run === replaying.current) await play(after);
  };

  const undo = (row: SkillRow) => {
    const previous = previousOf(row, records, model);

    if (!previous) return;

    setProject((p) => ({
      ...p,
      skills: withRecord(p.skills ?? [], { ...previous, createdAt: new Date().toISOString() }),
    }));
  };

  return {
    scope,
    start: (row: SkillRow) => setScope(canCoach(row) ? { target: row.target, label: row.label } : null),
    end: () => setScope(null),
    replay,
    stopReplay: () => {
      replaying.current += 1;
    },
    canUndo: (row: SkillRow) => !!previousOf(row, records, model),
    undo,
  };
}

export type SkillCoachState = ReturnType<typeof useSkillCoach>;
