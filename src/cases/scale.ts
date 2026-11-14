import type { V3 } from '../utils/kinematics';
import { caseSignalNames } from './caseFacts';
import { scaledFormula } from './contract';
import { caseSlots, type Case, type RobotSlot, type WorldObject } from './schema';
import type { CaseWorld } from './worldSet';

const SAME_SCALE = 1e-3;
const UP = 1;

function reachFrame(kase: Case, reachMm: number, anchor: V3) {
  const [lead] = caseSlots(kase);
  const authored = lead.reachMm;
  const from = lead.anchor ?? anchor;
  const s = authored && reachMm > 0 ? reachMm / authored : 1;
  const fromFloor = lead.needs.includes('gripper');
  const pinned = (i: number) => fromFloor && i === UP;
  const place = (p: V3): V3 => p.map((x, i) => (pinned(i) ? x * s : anchor[i] + (x - from[i]) * s)) as V3;
  const same = Math.abs(s - 1) < SAME_SCALE && from.every((x, i) => pinned(i) || x === anchor[i]);

  return { s, place, same };
}

const unmoved = (p: V3): V3 => p;

export function movableWorld(kase: Case | null, facts: { reachMm: number; anchor: V3 }): CaseWorld {
  const frame = kase && reachFrame(kase, facts.reachMm, facts.anchor);

  return { objects: kase?.world.objects ?? [], place: !frame || frame.same ? unmoved : frame.place };
}

export function scaledToReach(kase: Case, reachMm: number, anchor: V3): Case {
  const { s, place, same } = reachFrame(kase, reachMm, anchor);

  if (same) return kase;

  const onFloor = (p: V3): V3 => {
    const [x, , z] = place(p);

    return [x, p[1], z];
  };
  const unitless = caseSignalNames(kase);

  const object = (o: WorldObject): WorldObject => ({
    ...o,
    position: place(o.position),
    size: o.size.map((x) => x * s) as V3,
    ...(o.massG !== undefined ? { massG: o.massG * s ** 3 } : {}),
  });

  const guest = (slot: RobotSlot): RobotSlot => ({
    ...slot,
    ...(slot.reachMm !== undefined ? { reachMm: slot.reachMm * s } : {}),
    ...(slot.anchor ? { anchor: place(slot.anchor) } : {}),
    ...(slot.pose ? { pose: { ...slot.pose, position: onFloor(slot.pose.position) } } : {}),
  });
  const cast = kase.slots
    ? { slots: kase.slots.map((slot, i) => (i ? guest(slot) : { ...slot, reachMm, anchor })) }
    : { slot: { ...kase.slot!, reachMm, anchor } };

  return {
    ...kase,
    ...cast,
    world: { objects: kase.world.objects.map(object) },
    reference: {
      timeline: kase.reference.timeline.map((c) => (c.target ? { ...c, target: place(c.target) } : c)),
    },
    task: {
      ...kase.task,
      contract: {
        ...kase.task.contract,
        success: scaledFormula(kase.task.contract.success, s, unitless),
        failures: kase.task.contract.failures.map((f) => ({ ...f, formula: scaledFormula(f.formula, s, unitless) })),
      },
    },
  };
}
