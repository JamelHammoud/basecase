import { useRef, useState } from 'react';
import type { Case } from '../cases/schema';
import type { TryRecord } from '../cases/tries';
import { exportDatasetZip } from '../datasets/datasetClient';
import type { Dataset } from '../datasets/datasetFile';
import { hubBridge } from '../hub/hubBridge';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { errorMessage } from '../utils/errorMessage';
import { prepareDataset, type DatasetScene } from './datasetJob';
import { useDatasetRecords, type DatasetRecords } from './useDatasetRecords';
import type { ShowToast } from './types';
import { datasetDownload, deliverDataset, type DatasetDelivery } from './deliverImageDataset';

interface DatasetExportOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  cases: Case[];
  active: Case | null;
  sceneTries: TryRecord[];
  showToast: ShowToast;
  openAccounts: () => void;
}

export interface DatasetExport {
  canPublish: boolean;
  exporting: boolean;
  exportDataset: (dataset: Dataset) => void;
  publishDataset: (dataset: Dataset) => void;
  zip: (tries: TryRecord[]) => Promise<Uint8Array | null>;
  zipDataset: (dataset: Dataset) => Promise<Uint8Array | null>;
  records: DatasetRecords;
}

export const EARLIER_TRIES = 'These tries are from an earlier design. Try It again to record new ones.';
export const OTHER_TRIES = 'These tries are from another Case or scene.';
export const FITTING_TRIES =
  'Export and training take only passed tries of this Case as it is now. Try It to record more.';

interface Delivery {
  busy: string;
  failed: string;
  publish: boolean;
}

const EXPORT: Delivery = { busy: 'Exporting dataset…', failed: 'Couldn’t export the dataset.', publish: false };
const PUBLISH: Delivery = { busy: 'Publishing dataset…', failed: 'Couldn’t publish the dataset.', publish: true };

const exportable = ({ version, prepared }: DatasetDelivery) =>
  !!version.archive || !!prepared || !!version.snapshot?.images.length;

export function useDatasetExport(options: DatasetExportOptions): DatasetExport {
  const { sim, rig, parts, cases, active, showToast, openAccounts } = options;
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);
  const records = useDatasetRecords(options.sceneTries);
  const caseOf = (dataset: Dataset) => cases.find((kase) => kase.id === dataset.caseId) ?? null;
  const sceneFor = async (kase: Case | null): Promise<DatasetScene> => ({
    model: sim.model ?? (await sim.buildModel()),
    robotName: rig.robots[0]?.name ?? 'robot',
    parts,
    world: sim.worldParts,
    guests: sim.guestParts,
    kase,
  });

  const prepareFor = async (dataset: Dataset): Promise<DatasetDelivery> => {
    const selected = dataset.selectedVersion !== undefined;
    const scene = !selected && dataset.members.length ? await sceneFor(caseOf(dataset)) : undefined;
    const version = selected ? await records.resolve(dataset) : await records.resolve(dataset, scene?.model, scene);

    if (version.archive || !version.snapshot?.samples.length) return { version };

    const frozenScene = await records.scene(version);

    if (!frozenScene) throw new Error('The dataset is missing its saved scene.');

    const prepared = await prepareDataset({
      scene: frozenScene,
      kase: frozenScene.kase === undefined ? caseOf(dataset) : frozenScene.kase,
      name: version.snapshot.dataset?.name ?? dataset.name,
      task: version.snapshot.task,
      records: [],
      snapshot: version.snapshot,
    });

    return { version, prepared: prepared ?? undefined };
  };

  const run = async (dataset: Dataset, delivery: Delivery) => {
    setExporting(true);
    showToast(delivery.busy, { tone: 'progress' });

    try {
      const made = await prepareFor(dataset);

      if (!exportable(made)) {
        showToast(FITTING_TRIES, { tone: 'error' });

        return;
      }

      const done = await deliverDataset(dataset, records, delivery.publish, made);

      showToast(done.message, done.options);
    } catch (err) {
      showToast(`${delivery.failed} ${errorMessage(err)}`, { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const once = async (work: () => Promise<void>) => {
    if (busy.current) return;

    busy.current = true;

    try {
      await work();
    } finally {
      busy.current = false;
    }
  };

  const publish = async (dataset: Dataset) => {
    if (await hubBridge.signedIn()) await run(dataset, PUBLISH);
    else openAccounts();
  };

  return {
    canPublish: !IS_WEB_DEMO,
    exporting,
    exportDataset: (dataset) => void once(() => run(dataset, EXPORT)),
    publishDataset: (dataset) => {
      if (!IS_WEB_DEMO) void once(() => publish(dataset));
    },
    zip: async (all) => {
      if (!active) return null;

      const made = await prepareDataset({
        scene: await sceneFor(active),
        kase: active,
        name: active.name,
        task: active.brief.trim() || active.name,
        records: all,
      });

      return made ? exportDatasetZip(made.job) : null;
    },
    zipDataset: async (dataset) => {
      const made = await prepareFor(dataset);

      return exportable(made) ? datasetDownload(dataset, records, made) : null;
    },
    records,
  };
}
