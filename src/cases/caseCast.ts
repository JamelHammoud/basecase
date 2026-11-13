import type { MeshMeasure } from '../three/meshMeasure';
import type { MjcfInput } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import { buildRig, type Rig, type V3 } from '../utils/kinematics';
import { boundEffector, robotFacts, slotRefusal, type EndEffector, type RobotFacts } from './robotFit';
import { scaledToReach } from './scale';
import { caseSlots, type Case, type RobotSlot } from './schema';
import {
  placedEffector,
  placedRobot,
  placementOf,
  robotPivot,
  slotKeys,
  slotPrefix,
  type Placement,
  type SlotRobot,
} from './slots';

export interface CaseRobot extends SlotRobot {
  id: string;
  measures: MjcfInput['measures'];
  partTriangles: MjcfInput['partTriangles'];
}

export type NamedSlot = RobotSlot & { id: string };

export interface Guest {
  slot: NamedSlot;
  robot: SlotRobot;
  place: Placement;
}

export interface CastSlot {
  id: string;
  key: string | null;
  facts: RobotFacts;
  effector: EndEffector | null;
}

export function guestsOf(slots: NamedSlot[], partners: Array<SlotRobot | undefined>): Guest[] {
  return slots.slice(1).flatMap((slot, i) => {
    const robot = partners[i];

    return robot ? [{ slot, robot, place: placementOf(slot, robotPivot(robot)) }] : [];
  });
}

export function castJoined(lead: SlotRobot, guests: Guest[]): SlotRobot {
  const placed = guests.map((g) => placedRobot(g.robot, g.place));

  return {
    parts: [...lead.parts, ...placed.flatMap((r) => r.parts)],
    joints: [...lead.joints, ...placed.flatMap((r) => r.joints)],
  };
}

const CORNERS = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z])));

function placedMeasure(m: MeshMeasure, place: Placement): MeshMeasure {
  const corners = CORNERS.map((c) => place.at(c.map((k, axis) => (k ? m.max : m.min)[axis]) as V3));
  const extent = (pick: (...v: number[]) => number) => [0, 1, 2].map((axis) => pick(...corners.map((c) => c[axis])));

  return {
    ...m,
    min: extent(Math.min) as V3,
    max: extent(Math.max) as V3,
    centroid: place.at(m.centroid),
  };
}

export function castRobot(lead: CaseRobot, guests: Array<Guest & { robot: CaseRobot }>): CaseRobot {
  if (!guests.length) return lead;

  const joined = castJoined(lead, guests);
  const measures = { ...lead.measures };

  for (const g of guests)
    for (const [id, m] of Object.entries(g.robot.measures)) if (m) measures[g.place.id(id)] = placedMeasure(m, g.place);

  const ownerOf = (id: string) => guests.find((g) => id.startsWith(slotPrefix(g.slot.id)));

  return {
    id: lead.id,
    ...joined,
    measures,
    partTriangles: (id) => {
      const guest = ownerOf(id);

      return guest ? guest.robot.partTriangles(id.slice(slotPrefix(guest.slot.id).length)) : lead.partTriangles(id);
    },
  };
}

function guestEffector(guest: Guest): EndEffector | null {
  const rig = buildRig(guest.robot.joints, guest.robot.parts);
  const own = robotFacts(rig, guest.robot.parts);

  return placedEffector(boundEffector(guest.slot.binding, own, rig), guest.place);
}

export function castSlots(slots: NamedSlot[], cast: { rig: Rig; parts: ScenePart[]; guests: Guest[] }): CastSlot[] {
  const keys = slotKeys(cast.rig.robots, slots);

  return slots.map((slot, i) => {
    const key = keys[i];
    const facts = robotFacts(cast.rig, cast.parts, key ?? undefined);
    const guest = cast.guests.find((g) => g.slot.id === slot.id);
    const effector = guest && i ? guestEffector(guest) : boundEffector(slot.binding, facts, cast.rig);

    return { id: slot.id, key, facts, effector };
  });
}

const factsOf = (robot: SlotRobot) => robotFacts(buildRig(robot.joints, robot.parts), robot.parts);

export function fillSlots(slots: NamedSlot[], partners: SlotRobot[]): Array<SlotRobot | undefined> {
  const free = [...partners];

  return slots.slice(1).map((slot) => {
    const at = free.findIndex((robot) => !slotRefusal(slot, factsOf(robot)));

    return at < 0 ? undefined : free.splice(at, 1)[0];
  });
}

export interface StagedCase {
  kase: Case;
  slots: NamedSlot[];
  guests: Guest[];
  joined: SlotRobot;
  partners: Array<SlotRobot | undefined>;
}

export function stageCase(authored: Case, lead: { rig: Rig; parts: ScenePart[] }, partners: SlotRobot[]): StagedCase {
  const facts = robotFacts(lead.rig, lead.parts);
  const kase = scaledToReach(authored, facts.reachMm, facts.anchor);
  const slots = caseSlots(kase);
  const filled = fillSlots(slots, partners);
  const guests = guestsOf(slots, filled);

  return { kase, slots, guests, joined: castJoined({ parts: [], joints: [] }, guests), partners: filled };
}

export function castOf(staged: StagedCase, scene: { rig: Rig; parts: ScenePart[] }) {
  const parts = [...scene.parts, ...staged.joined.parts];
  const rig = staged.guests.length ? buildRig([...scene.rig.joints, ...staged.joined.joints], parts) : scene.rig;

  return { rig, parts, slots: castSlots(staged.slots, { rig, parts, guests: staged.guests }) };
}

export function stagedEffectors(staged: StagedCase, scene: { rig: Rig; parts: ScenePart[] }) {
  const { slots } = castOf(staged, scene);

  return {
    effector: slots[0]?.effector ?? null,
    effectors: Object.fromEntries(slots.map((s) => [s.id, s.effector])),
  };
}
