import type { V3 } from '../utils/kinematics';
import { scaledFormula } from './contract';
import type { Case, WorldObject } from './schema';

const SAME_SCALE = 1e-3;

export function scaledToReach(kase: Case, reachMm: number, anchor: V3): Case {
  const authored = kase.slot.reachMm;
  const from = kase.slot.anchor ?? anchor;
  const s = authored && reachMm > 0 ? reachMm / authored : 1;
  const place = (p: V3): V3 => p.map((x, i) => anchor[i] + (x - from[i]) * s) as V3;
  const sameScale = Math.abs(s - 1) < SAME_SCALE;
  const sameAnchor = from.every((x, i) => x === anchor[i]);

  if (sameScale && sameAnchor) return kase;

  const object = (o: WorldObject): WorldObject => ({
    ...o,
    position: place(o.position),
    size: o.size.map((x) => x * s) as V3,
    ...(o.massG !== undefined ? { massG: o.massG * s ** 3 } : {}),
  });

  return {
    ...kase,
    slot: { ...kase.slot, reachMm, anchor },
    world: { objects: kase.world.objects.map(object) },
    reference: {
      timeline: kase.reference.timeline.map((c) => (c.target ? { ...c, target: place(c.target) } : c)),
    },
    task: {
      ...kase.task,
      contract: {
        ...kase.task.contract,
        success: scaledFormula(kase.task.contract.success, s),
        failures: kase.task.contract.failures.map((f) => ({ ...f, formula: scaledFormula(f.formula, s) })),
      },
    },
  };
}
