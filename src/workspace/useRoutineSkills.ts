import { useRef } from 'react';
import type { HandoffResult } from '../routines/handoffTraining';
import type { Handoff } from '../routines/schema';
import type { DriveSetup } from '../sim/drive';
import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from '../skills/artifacts';
import { canTrainHandoff } from '../skills/handoff';
import { recordEnvironment, skillRecord, type SkillRecord } from '../skills/skillRecords';
import type { SkillRow, SkillTarget } from '../skills/skillRows';
import { designOf, type SkillsRuntime } from '../skills/skillsRuntime';
import type { ProjectSettings, RobotJoint } from '../types/robotics';
import { useLatestRef } from '../utils/useLatestRef';
import { ownId, sceneSkills, type OwnSkill, type RoutineSkills } from './routineCheck';

export interface HandoffJob {
  pair: Handoff;
  model: SimModel;
  joints: RobotJoint[];
  drive: DriveSetup | null;
}

export interface SceneRoutineSkills extends RoutineSkills {
  trainable: (own: readonly OwnSkill[]) => string[];
  replace: (old: OwnSkill, skill: Skill) => void;
}

interface RoutineSkillsInput {
  rows: SkillRow[];
  load: (record: SkillRecord) => Promise<Skill | null>;
  project: ProjectSettings;
  setProject: (update: (p: ProjectSettings) => ProjectSettings) => void;
}

const ownRow = (row: SkillRow) => !row.kit && row.state.kind === 'ready' && !!row.record;

export function useRoutineSkills({ rows, load, project, setProject }: RoutineSkillsInput): SceneRoutineSkills {
  'use memo';

  const latest = useLatestRef({ rows, handoffs: project.handoffs });
  const cache = useRef(new Map<string, Promise<Skill | null>>());

  const loaded = (record: SkillRecord) => {
    const known = cache.current.get(record.hash) ?? load(record).catch(() => null);

    cache.current.set(record.hash, known);

    return known;
  };

  const own = async (): Promise<OwnSkill[]> => {
    const found = await Promise.all(
      latest.current.rows.filter(ownRow).map(async (row) => {
        const record = row.record!;
        const skill = await loaded(record);

        return skill ? [{ hash: record.hash, skill, record }] : [];
      }),
    );

    return found.flat();
  };

  const replace = (old: OwnSkill, skill: Skill) => {
    const record = old.record
      ? skillRecord(skill, { kit: null, move: old.record.move ?? undefined, goal: old.record.goal })
      : null;

    if (!record) return;

    setProject((p) => ({ ...p, skills: [...(p.skills ?? []).filter((r) => r.hash !== old.hash), record] }));
  };

  return {
    own,
    handoffs: () => latest.current.handoffs,
    trainable: (list) => list.filter((o) => !!o.record?.move).map(ownId),
    replace,
  };
}

const rowTarget = (record: SkillRecord): SkillTarget =>
  record.move ? `move:${record.move.animation}` : `goal:${record.name}`;

export interface HandoffTraining {
  result: HandoffResult;
  target: OwnSkill;
}

export async function trainHandoff(options: {
  runtime: SkillsRuntime;
  routineSkills: SceneRoutineSkills;
  project: ProjectSettings;
  job: HandoffJob;
}): Promise<HandoffTraining | null> {
  const { runtime, routineSkills, project, job } = options;
  const own = await routineSkills.own();
  const target = own.find((o) => ownId(o) === job.pair.to);
  const environment = target?.record && recordEnvironment(target.record, job.model, project.animations ?? []);

  if (!target?.record || !environment || !canTrainHandoff(environment)) return null;

  const skills = await sceneSkills(own);
  const result = await runtime.trainHandoff(
    {
      scene: { model: job.model, joints: job.joints, drive: job.drive, skills },
      design: designOf(job.model),
      pair: job.pair,
      target: target.skill,
      environment,
    },
    { target: rowTarget(target.record), label: target.skill.name },
  );

  return result && { result, target };
}
