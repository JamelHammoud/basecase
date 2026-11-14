import { useRef, useState } from 'react';
import type { Case } from '../cases/schema';
import type { TryRecord } from '../cases/tries';
import { exportDatasetFiles, exportDatasetZip } from '../datasets/datasetClient';
import type { Dataset } from '../datasets/datasetFile';
import { hubBridge } from '../hub/hubBridge';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import type { Rig } from '../utils/kinematics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { openLink } from '../utils/openLink';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';
import { prepareDataset, repoName, type PreparedDataset } from './datasetJob';
import { useDatasetRecords, type DatasetRecords } from './useDatasetRecords';
import type { ShowToast, ToastOptions } from './types';

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

interface Made {
  dataset: Dataset;
  prepared: PreparedDataset;
}

interface Delivery {
  busy: string;
  failed: string;
  deliver: (made: Made, records: DatasetRecords) => Promise<{ message: string; options?: ToastOptions }>;
}

const leftOut = (made: PreparedDataset) => (made.left ? `, left out ${made.left} from an earlier design` : '');

const EXPORT: Delivery = {
  busy: 'Exporting dataset…',
  failed: 'Couldn’t export the dataset.',
  deliver: async ({ dataset, prepared }, records) => {
    await records.freeze(dataset);
    downloadBytes(await exportDatasetZip(prepared.job), `${prepared.name}.zip`, 'application/zip');

    return { message: `Exported ${plural(prepared.used, 'try', 'tries')} as a dataset${leftOut(prepared)}` };
  },
};

const PUBLISH: Delivery = {
  busy: 'Publishing dataset…',
  failed: 'Couldn’t publish the dataset.',
  deliver: async ({ dataset, prepared }, records) => {
    const version = await records.freeze(dataset);
    const files = await exportDatasetFiles(prepared.job);
    const name = await repoName(dataset.name, dataset.id);
    const published = await hubBridge.publish({ name, files, tag: `dataset-v${version.n}` });

    return {
      message: `Published to ${published.repo}${leftOut(prepared)}`,
      options: { action: { label: 'Open', onClick: () => openLink(published.url) } },
    };
  },
};

export function useDatasetExport(options: DatasetExportOptions): DatasetExport {
  const { sim, rig, parts, cases, active, showToast, openAccounts } = options;
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);
  const records = useDatasetRecords(options.sceneTries);

  const prepare = async (kase: Case | null, from: { name: string; task: string; records: TryRecord[] }) =>
    prepareDataset({
      scene: {
        model: sim.model ?? (await sim.buildModel()),
        robotName: rig.robots[0]?.name ?? 'robot',
        parts,
        world: sim.worldParts,
        guests: sim.guestParts,
      },
      kase,
      ...from,
    });

  const caseOf = (dataset: Dataset) => cases.find((c) => c.id === dataset.caseId) ?? null;
  const prepareFor = (dataset: Dataset) =>
    prepare(caseOf(dataset), { name: dataset.name, task: dataset.task, records: records.of(dataset) });

  const run = async (dataset: Dataset, delivery: Delivery) => {
    setExporting(true);
    showToast(delivery.busy, { tone: 'progress' });

    try {
      const prepared = await prepareFor(dataset);

      if (!prepared) {
        showToast(EARLIER_TRIES, { tone: 'error' });

        return;
      }

      const done = await delivery.deliver({ dataset, prepared }, records);

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
      const kase = active && { name: active.name, task: active.brief.trim() || active.name, records: all };
      const made = kase && (await prepare(active, kase));

      return made ? exportDatasetZip(made.job) : null;
    },
    zipDataset: async (dataset) => {
      const made = await prepareFor(dataset);

      if (made) await records.freeze(dataset);

      return made ? exportDatasetZip(made.job) : null;
    },
    records,
  };
}
