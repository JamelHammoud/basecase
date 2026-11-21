import { hashOf } from '../skills/hash';
import { sameBuildOwner } from '../../electron/backend/buildAllocations.mjs';
import type { BuildOwner } from './allocationTypes';
import type { BuildRecord } from './buildPersistence';
import type { BuildRepairRecord } from './buildRepairTypes';
import type { FrozenKit } from './frozenKit';
import type { Purchases } from '../types/robotics';
import { buildDemand } from './buildDemand';

export function repairOwner(record: BuildRecord, repair: BuildRepairRecord): BuildOwner {
  return { id: record.id, name: record.name, kit: record.kit, repair: repair.id, revision: repair.target };
}

export function repairDemand(kit: FrozenKit, repair: BuildRepairRecord) {
  const demand = buildDemand(kit);
  const affected = new Set(repair.affected);
  const cables = repair.plan.declarations.filter((action) => action.replacementKey);

  return {
    components: demand.components.flatMap((line) => {
      const replacementCables = cables.filter((action) => action.replacementKey === line.key);
      const parts = line.partIds.filter((id) => affected.has(id));
      const qty = parts.length + replacementCables.length;
      const partIds = [...new Set([...parts, ...replacementCables.flatMap((action) => action.ids)])];

      return qty ? [{ ...line, partIds, qty }] : [];
    }),
    printed: demand.printed.filter((line) => affected.has(line.partId)),
  };
}

export function repairAllocationEvidence(
  record: BuildRecord,
  repair: BuildRepairRecord,
  kit: FrozenKit,
  purchases: Purchases,
) {
  const demand = repairDemand(kit, repair);
  const owner = repairOwner(record, repair);
  const components = demand.components.map((line) => {
    const reserved = purchases[line.key]?.reservations?.find((entry) => sameBuildOwner(entry.build, owner));

    if (!reserved || reserved.quantity !== line.qty || hashOf(reserved.demand) !== hashOf(line))
      throw new Error('Reserve the replacement components before finishing the repair.');

    return reserved;
  });
  const copies = demand.printed.map((line) => {
    const held = Object.values(purchases).flatMap((entry) =>
      Object.values(entry.printOutput?.assignments ?? {})
        .flat()
        .filter(
          (assignment) =>
            !assignment.returnedAt &&
            sameBuildOwner(assignment.build, owner) &&
            assignment.demand.partId === line.partId,
        ),
    );

    if (line.refusal || held.length !== line.qty || held.some((item) => hashOf(item.demand) !== hashOf(line)))
      throw new Error('Assign the replacement copies before finishing the repair.');

    return held;
  });

  return { at: new Date().toISOString(), signature: hashOf({ components, copies }) };
}
