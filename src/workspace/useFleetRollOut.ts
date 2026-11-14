import { useState, type RefObject } from 'react';
import { fleetSnapshot, rollBackUnit, selectUnit, unitSnapshot } from '../robot/robotStore';
import { connectedUnits } from '../robot/robotUnits';
import { sceneRobotChoices } from '../robot/sceneRobot';
import { unitHistories } from '../reality/projectCalibrations';
import type { SkillRow } from '../skills/skillRows';
import type { Skill } from '../skills/artifacts';
import type { ProjectSettings } from '../types/robotics';
import type { FleetTools, RollOutAsk } from '../fleet/fleetTools';
import { rollingOut, startRollOut, unitPorts, useRollOut } from '../fleet/rollOutStore';
import { rollOutText } from '../fleet/rollOutText';
import { twinVerdict, withTwins, type TwinVerdict } from '../fleet/twinArena';
import type { SceneSkills } from './useSkills';
import { useFleet } from '../robot/useRobot';

interface FleetInput {
  skills: SceneSkills;
  projectRef: RefObject<ProjectSettings>;
  setProject: (patch: (project: ProjectSettings) => ProjectSettings) => void;
}

const sameIds = (a: readonly string[] | null, b: readonly string[]) =>
  !!a && a.length === b.length && a.every((id, k) => id === b[k]);

export function sceneUnits(project: ProjectSettings): string[] {
  const robot = sceneRobotChoices(project.joints ?? []);

  if (!robot.ok) return [];

  return connectedUnits(fleetSnapshot())
    .filter((u) => robot.choices.some((c) => sameIds(u.joints, c.joints)))
    .map((u) => u.unit);
}

export const canRollOut = (row: SkillRow, project: ProjectSettings) =>
  row.state.kind === 'ready' && !!row.record && sceneUnits(project).length > 0 && !rollingOut();

function prover({ skills, projectRef }: FleetInput, row: SkillRow) {
  let loaded: Promise<Skill | null> | null = null;
  const environment = skills.environmentOf(row);

  return async (unit: string): Promise<TwinVerdict> => {
    loaded ??= row.record ? skills.loadSkill(row.record) : Promise.resolve(null);

    const skill = await loaded;

    if (!skill || skill.controller.kind !== 'policy')
      return { unit, passes: 0, trials: 0, passed: false, line: 'Choose a skill with a saved policy.' };

    if (!environment)
      return { unit, passes: 0, trials: 0, passed: false, line: 'Recheck this skill before rolling it out.' };

    const model = await skills.buildModel({ alone: true, calibrations: unitHistories(projectRef.current, unit) });

    return twinVerdict(unit, await skills.runtime.twin(model, skill, environment));
  };
}

async function rollOutRow(input: FleetInput, row: SkillRow, ask: Pick<RollOutAsk, 'canaries' | 'units'> = {}) {
  const record = row.record;

  if (!record || row.state.kind !== 'ready') return null;

  const result = await startRollOut({
    skill: { hash: record.hash, label: row.label },
    units: ask.units?.length ? ask.units : sceneUnits(input.projectRef.current),
    canaries: ask.canaries,
    ports: unitPorts(prover(input, row)),
  });

  if (result) input.setProject((p) => ({ ...p, skills: withTwins(p.skills ?? [], record.hash, result.verdicts) }));

  return result;
}

const named = (rows: readonly SkillRow[], name: string) => {
  const wanted = name.trim().toLowerCase();

  return rows.find(
    (r) => r.state.kind === 'ready' && [r.label, r.record?.name].some((n) => n?.toLowerCase() === wanted),
  );
};

export function fleetTools(input: FleetInput): FleetTools {
  return {
    select: (unit) => (selectUnit(unit) ? null : `No connected robot is named ${unit}.`),
    rollOut: async (ask) => {
      const row = named(input.skills.rows, ask.skill);

      if (!row) return `No ready skill is named ${ask.skill}.`;

      const available = sceneUnits(input.projectRef.current);
      const requested = [...(ask.units ?? []), ...(ask.canaries ?? [])];
      const other = requested.find((unit) => !available.includes(unit));

      if (other) return `Choose a robot from this scene: ${other}.`;

      const result = await rollOutRow(input, row, ask);

      return result ? rollOutText(result) : 'A roll out is already running.';
    },
    rollBack: async (unit) => {
      const previous = unitSnapshot(unit)?.previous ?? null;
      const reply = await rollBackUnit(unit);

      if (!reply.ok) return reply.message;

      return previous ? `Rolled ${unit} back to ${previous}.` : `Rolled ${unit} back to no policy.`;
    },
  };
}

export function useFleetRollOut(input: FleetInput) {
  const [pending, setPending] = useState<string | null>(null);

  useFleet();
  useRollOut();

  const row = input.skills.rows.find((candidate) => candidate.record?.hash === pending);
  const units = sceneUnits(input.projectRef.current);
  const close = () => setPending(null);
  const confirm = (canaries: string[]) => {
    close();

    if (row && canRollOut(row, input.projectRef.current)) void rollOutRow(input, row, { canaries });
  };

  return {
    tools: fleetTools(input),
    rollOut: (candidate: SkillRow) => {
      if (canRollOut(candidate, input.projectRef.current)) setPending(candidate.record?.hash ?? null);
    },
    canRollOut: (row: SkillRow) => canRollOut(row, input.projectRef.current),
    choice: row && units.length ? { label: row.label, hash: pending, units, close, confirm } : null,
  };
}

export type FleetRollOut = ReturnType<typeof useFleetRollOut>;
