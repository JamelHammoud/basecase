import { fleetBuildReference } from '../fleet/buildReference';
import { buildRepairStarter } from './buildRepairStart';
import { selectedRepair, changeRepair, stepOf } from './buildRepairState';
import { buildRepairFinisher } from './buildRepairFinish';
import {
  indexOf,
  recordKey,
  recordOf,
  readContent,
  storedBuildContent,
  summaryOf,
  type BuildStorage,
  type BuildRecord,
} from './buildPersistence';

export function createBuildRepairOperations(storage: BuildStorage, limits: { maxBytes: number }) {
  const update = (id: string, change: (record: BuildRecord) => BuildRecord) =>
    storage.update(['index', recordKey(id)], ([savedIndex, saved]) => {
      const index = indexOf(savedIndex);
      const record = change(recordOf(saved));

      if (record.id !== id || !index.records.some((item) => item.id === id))
        throw new Error('The build history is damaged.');

      return {
        puts: {
          [recordKey(id)]: record,
          index: { ...index, records: index.records.map((item) => (item.id === id ? summaryOf(record) : item)) },
        },
        result: record,
      };
    });
  const openRevision = async (id: string, hash: string) => {
    const record = recordOf(await storage.get(recordKey(id)));

    if (!(record.retained ?? [record.kit]).includes(hash)) throw new Error('Choose a retained Kit.');

    return readContent(await storedBuildContent(storage, hash));
  };
  const startRepair = buildRepairStarter(storage, limits);
  const repairAction = ({
    id,
    repair: repairId,
    step,
    complete,
  }: {
    id: string;
    repair: string;
    step: number;
    complete: boolean;
  }) =>
    update(id, (record) => {
      const repair = selectedRepair(record, repairId);
      const key = String(stepOf(repair, step));

      if (repair.state === 'cancelled') throw new Error('Resume the repair first.');

      if (
        complete &&
        Array.from({ length: step }, (_, index) => String(index)).some((index) => !repair.completed[index])
      )
        throw new Error('Record the preceding repair steps first.');

      if (!complete && Object.keys(repair.completed).some((index) => Number(index) > step))
        throw new Error('Undo the later repair steps first.');

      const completed = { ...repair.completed };

      if (complete) completed[key] ??= new Date().toISOString();
      else delete completed[key];

      return changeRepair(record, { ...repair, completed, state: 'active' });
    });
  const navigateRepair = (id: string, repairId: string, step: number) =>
    update(id, (record) => {
      const repair = selectedRepair(record, repairId);

      return changeRepair(record, { ...repair, index: stepOf(repair, step) });
    });
  const cancelRepair = (id: string, repairId: string) =>
    update(id, (record) => {
      const repair = selectedRepair(record, repairId);

      return changeRepair(record, {
        ...repair,
        state: Object.keys(repair.completed).length ? 'incomplete' : 'cancelled',
      });
    });
  const resumeRepair = (id: string, repairId: string) =>
    update(id, (record) => changeRepair(record, { ...selectedRepair(record, repairId), state: 'active' }));
  const stageRepair = (id: string, repairId: string) =>
    update(id, (record) => {
      const repair = selectedRepair(record, repairId);

      if (Object.keys(repair.completed).length !== repair.count) throw new Error('Record every repair step first.');

      return changeRepair(record, { ...repair, state: 'incomplete' });
    });
  const finishRepair = buildRepairFinisher(storage, openRevision, update);
  const linkRepairFleet = ({ id, repair: repairId, reference }: { id: string; repair: string; reference: unknown }) =>
    update(id, (record) => {
      const link = fleetBuildReference(reference);
      const repair = record.repairs?.find((item) => item.id === repairId);

      if (
        !repair ||
        link.build !== id ||
        link.repair !== repairId ||
        link.source !== repair.source ||
        link.target !== repair.target
      )
        throw new Error('Choose the Fleet reference for this repair.');

      return {
        ...record,
        repairs: record.repairs!.map((item) =>
          item.id === repairId ? { ...item, fleet: { organization: link.organization, robot: link.robot } } : item,
        ),
      };
    });

  return {
    linkRepairFleet,
    openRevision,
    startRepair,
    repairAction,
    navigateRepair,
    cancelRepair,
    resumeRepair,
    stageRepair,
    finishRepair,
  };
}
