import { useState } from 'react';
import { buildCase, builderRobot, goalsFor, type BuiltCase, type CaseSpec } from '../cases/caseBuilder';
import type { Case } from '../cases/schema';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

interface CaseBuilderOptions {
  rig: Rig;
  parts: ScenePart[];
  add: (kase: Case) => Case;
}

export function useCaseBuilder({ rig, parts, add }: CaseBuilderOptions) {
  const [open, setOpen] = useState(false);
  const robot = builderRobot(rig, parts);
  const goals = rig.robots.length ? goalsFor(robot) : [];

  const addSpec = (spec: CaseSpec): BuiltCase => {
    const built = buildCase(spec, robot);

    return built.ok ? { ok: true, kase: add(built.kase) } : built;
  };

  const create = (spec: CaseSpec): BuiltCase => {
    const built = addSpec(spec);

    if (built.ok) setOpen(false);

    return built;
  };

  return {
    open: open && goals.length > 0,
    robot,
    goals,
    preview: (spec: CaseSpec) => buildCase(spec, robot),
    create,
    add: addSpec,
    start: () => setOpen(true),
    cancel: () => setOpen(false),
  };
}

export type CaseBuilder = ReturnType<typeof useCaseBuilder>;
