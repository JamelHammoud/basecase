import { repairAllocationEvidence } from './buildRepairDemand';
import { selectedRepair, changeRepair } from './buildRepairState';
import { recordKey, recordOf, type BuildStorage, type BuildRecord } from './buildPersistence';
import type { FrozenKit } from './frozenKit';
import type { Purchases } from '../types/robotics';

export type BuildRecordUpdater = (id: string, change: (record: BuildRecord) => BuildRecord) => Promise<BuildRecord>;

export function buildRepairFinisher(
  storage: BuildStorage,
  openRevision: (id: string, hash: string) => Promise<FrozenKit>,
  update: BuildRecordUpdater,
) {
  return async ({ id, repair: repairId, purchases }: { id: string; repair: string; purchases: Purchases }) => {
    const before = recordOf(await storage.get(recordKey(id)));
    const repair = before.repairs?.find((item) => item.id === repairId);

    if (repair?.state === 'complete') return before;

    if (!repair) throw new Error('Open the current repair.');

    const kit = await openRevision(id, repair.target);
    const evidence = repairAllocationEvidence(before, repair, kit, purchases);

    return update(id, (record) => {
      if (record.repairs?.find((item) => item.id === repairId)?.state === 'complete') return record;

      const current = selectedRepair(record, repairId);

      if (current.state !== 'incomplete' || Object.keys(current.completed).length !== current.count)
        throw new Error('Record every repair step first.');

      return {
        ...changeRepair(record, {
          ...current,
          state: 'complete',
          completedAt: new Date().toISOString(),
          allocationEvidence: evidence,
        }),
        configuration: current.target,
      };
    });
  };
}
