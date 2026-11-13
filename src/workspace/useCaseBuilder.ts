import { useState } from 'react';
import { buildCase, builderRobot, goalsFor, type BuiltCase, type CaseSpec } from '../cases/caseBuilder';
import type { Room } from '../cases/roomPlan';
import type { Case } from '../cases/schema';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

interface CaseBuilderOptions {
  rig: Rig;
  parts: ScenePart[];
  add: (kase: Case) => Case;
}

interface Dropped {
  room: Room;
  key: number;
}

export function useCaseBuilder({ rig, parts, add }: CaseBuilderOptions) {
  const [open, setOpen] = useState(false);
  const [dropped, setDropped] = useState<Dropped | null>(null);
  const robot = builderRobot(rig, parts);
  const goals = rig.robots.length ? goalsFor(robot) : [];
  const room = dropped?.room;
  const withRoom = (spec: CaseSpec): CaseSpec => (room ? { ...spec, room } : spec);

  const addSpec = (spec: CaseSpec): BuiltCase => {
    const built = buildCase(withRoom(spec), robot);

    return built.ok ? { ok: true, kase: add(built.kase) } : built;
  };

  const create = (spec: CaseSpec): BuiltCase => {
    const built = addSpec(spec);

    if (built.ok) setOpen(false);

    return built;
  };

  const startInRoom = (next: Room) => {
    setDropped((d) => ({ room: next, key: (d?.key ?? 0) + 1 }));
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
    start: () => setOpen(true),
    startInRoom,
    cancel: () => setOpen(false),
  };
}

export type CaseBuilder = ReturnType<typeof useCaseBuilder>;
