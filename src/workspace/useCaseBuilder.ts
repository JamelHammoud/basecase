import { useState } from 'react';
import { buildCase, builderRobot, goalsFor, type BuiltCase, type CaseSpec } from '../cases/caseBuilder';
import type { BuilderRobot } from '../cases/caseGoals';
import type { Room } from '../cases/roomPlan';
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

interface Dropped {
  room: Room;
  key: number;
}

export function useCaseBuilder({ rig, parts, add, partners }: CaseBuilderOptions) {
  const [open, setOpen] = useState(false);
  const [partner, setPartner] = useState<BuilderRobot | undefined>(undefined);
  const [dropped, setDropped] = useState<Dropped | null>(null);
  const robot = { ...builderRobot(rig, parts), partner };
  const goals = rig.robots.length ? goalsFor(robot) : [];
  const room = dropped?.room;
  const withRoom = (spec: CaseSpec): CaseSpec => (room ? { ...spec, room } : spec);

  const addSpec = (spec: CaseSpec): BuiltCase => {
    const built = buildCase(withRoom(spec), { ...robot, partner: partner ?? partnerOf(partners()) });

    return built.ok ? { ok: true, kase: add(built.kase) } : built;
  };

  const create = (spec: CaseSpec): BuiltCase => {
    const built = addSpec(spec);

    if (built.ok) setOpen(false);

    return built;
  };

  const startInRoom = (next: Room) => {
    setDropped((d) => ({ room: next, key: (d?.key ?? 0) + 1 }));
    setPartner(partnerOf(partners()));
    setOpen(true);
  };

  return {
    open: open && goals.length > 0,
    robot,
    goals,
    room,
    roomKey: dropped?.key ?? 0,
    preview: (spec: CaseSpec) => buildCase(withRoom(spec), robot),
    create,
    add: addSpec,
    start: () => {
      setPartner(partnerOf(partners()));
      setOpen(true);
    },
    startInRoom,
    cancel: () => setOpen(false),
  };
}

export type CaseBuilder = ReturnType<typeof useCaseBuilder>;
