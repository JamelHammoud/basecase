import { useState } from 'react';
import {
  buildCase,
  builderRobot,
  goalsFor,
  isMesh,
  type BuiltCase,
  type CaseSpec,
  type Place,
} from '../cases/caseBuilder';
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

interface Dropped {
  place: Place;
  key: number;
}

export function useCaseBuilder({ rig, parts, add, partners }: CaseBuilderOptions) {
  const [open, setOpen] = useState(false);
  const [partner, setPartner] = useState<BuilderRobot | undefined>(undefined);
  const [dropped, setDropped] = useState<Dropped | null>(null);
  const robot = { ...builderRobot(rig, parts), partner };
  const goals = rig.robots.length ? goalsFor(robot) : [];
  const place = dropped?.place;
  const room = place && !isMesh(place) ? place : undefined;
  const meshWorld = place && isMesh(place) ? place : undefined;
  const withPlace = (spec: CaseSpec): CaseSpec => ({
    ...spec,
    room: spec.room ?? room,
    meshWorld: spec.meshWorld ?? meshWorld,
  });

  const addSpec = (spec: CaseSpec): BuiltCase => {
    const built = buildCase(withPlace(spec), { ...robot, partner: partner ?? partnerOf(partners()) });

    return built.ok ? { ok: true, kase: add(built.kase) } : built;
  };

  const create = (spec: CaseSpec): BuiltCase => {
    const built = addSpec(spec);

    if (built.ok) setOpen(false);

    return built;
  };

  const startIn = (next: Place) => {
    setDropped((d) => ({ place: next, key: (d?.key ?? 0) + 1 }));
    setPartner(partnerOf(partners()));
    setOpen(true);
  };

  return {
    open: open && goals.length > 0,
    robot,
    goals,
    room,
    meshWorld,
    place,
    placeKey: dropped?.key ?? 0,
    preview: (spec: CaseSpec) => buildCase(withPlace(spec), robot),
    create,
    add: addSpec,
    start: () => {
      setPartner(partnerOf(partners()));
      setOpen(true);
    },
    startIn,
    cancel: () => setOpen(false),
  };
}

export type CaseBuilder = ReturnType<typeof useCaseBuilder>;
