import { useState } from 'react';
import { buildCase, builderRobot, goalsFor, type BuiltCase, type CaseSpec } from '../cases/caseBuilder';
import type { BuilderRobot } from '../cases/caseGoals';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import type { ScenePart } from '../types/robotics';
import { buildRig, type Rig } from '../utils/kinematics';

interface CaseBuilderOptions {
  rig: Rig;
  parts: ScenePart[];
  add: (kase: Case) => Case;
  partners: () => SlotRobot[];
}

function partnerOf(partners: SlotRobot[]): BuilderRobot | undefined {
  const robots = partners.map((r) => builderRobot(buildRig(r.joints, r.parts), r.parts));

  return robots.find((r) => r.facts.endEffector) ?? robots[0];
}

export function useCaseBuilder({ rig, parts, add, partners }: CaseBuilderOptions) {
  const [open, setOpen] = useState(false);
  const [partner, setPartner] = useState<BuilderRobot | undefined>(undefined);
  const robot = { ...builderRobot(rig, parts), partner };
  const goals = rig.robots.length ? goalsFor(robot) : [];

  const addSpec = (spec: CaseSpec): BuiltCase => {
    const built = buildCase(spec, { ...robot, partner: partner ?? partnerOf(partners()) });

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
    start: () => {
      setPartner(partnerOf(partners()));
      setOpen(true);
    },
    cancel: () => setOpen(false),
  };
}

export type CaseBuilder = ReturnType<typeof useCaseBuilder>;
