import { useState } from 'react';
import type { Case } from '../cases/schema';
import { sha256, type TryRecord } from '../cases/tries';
import { loadRecording } from '../cases/tryStore';
import type { DatasetFiles, DatasetJobEpisode } from '../datasets/buildDataset';
import { datasetCameras, snakeKey } from '../datasets/cameras';
import { exportDatasetFiles, exportDatasetZip, type DatasetSpec } from '../datasets/datasetClient';
import { canExport } from '../datasets/episodes';
import { hubBridge } from '../hub/hubBridge';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import type { Rig } from '../utils/kinematics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { fileSafe } from './helpers';
import type { ShowToast, ToastOptions } from './types';

interface DatasetExportOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  tries: TryRecord[];
  showToast: ShowToast;
  openAccounts: () => void;
}

export interface DatasetExport {
  canExport: boolean;
  canPublish: boolean;
  exporting: boolean;
  exportDataset: () => void;
  publishDataset: () => void;
  files: (tries: TryRecord[]) => Promise<DatasetFiles | null>;
}

async function usableEpisodes(kase: Case, passed: TryRecord[], model: SimModel) {
  const modelHash = await sha256(model.xml);
  const episodes: DatasetJobEpisode[] = [];

  for (const record of passed) {
    const recording = record.manifest.modelHash === modelHash ? await loadRecording(record.id) : null;

    if (!recording || !canExport(recording, model)) continue;

    episodes.push({
      recording,
      task: kase.brief.trim() || kase.name,
      source: { try: record.id, at: record.at, margin: record.margin, case_hash: record.manifest.caseHash },
    });
  }

  return { episodes, modelHash };
}

const triesText = (n: number) => (n === 1 ? '1 try' : `${n} tries`);

interface PreparedDataset {
  job: DatasetSpec;
  name: string;
  used: number;
  left: number;
}

type PrepareInput = Pick<DatasetExportOptions, 'sim' | 'rig' | 'parts'> & { kase: Case; tries: TryRecord[] };

async function prepareDataset({ sim, rig, parts, kase, tries }: PrepareInput): Promise<PreparedDataset | null> {
  const model = sim.model ?? (await sim.buildModel());
  const { episodes, modelHash } = await usableEpisodes(kase, tries, model);

  if (!episodes.length) return null;

  const visible = parts.filter((p) => p.visible && p.role === 'solid');
  const name = `${fileSafe(kase.name)}-dataset`;
  const job: DatasetSpec = {
    name,
    robotType: snakeKey(rig.robots[0]?.name ?? 'robot'),
    parts: visible,
    world: sim.worldParts,
    model,
    cameras: datasetCameras(visible, sim.worldParts),
    episodes,
    source: { app: 'basecase', case: kase.id, case_name: kase.name, model_hash: modelHash },
  };

  return { job, name, used: episodes.length, left: tries.length - episodes.length };
}

interface Delivery {
  busy: string;
  failed: string;
  deliver: (made: PreparedDataset) => Promise<{ message: string; options?: ToastOptions }>;
}

const leftOut = (made: PreparedDataset) => (made.left ? `, left out ${made.left} from an earlier design` : '');

const EXPORT: Delivery = {
  busy: 'Exporting dataset…',
  failed: 'Couldn’t export the dataset.',
  deliver: async (made) => {
    downloadBytes(await exportDatasetZip(made.job), `${made.name}.zip`, 'application/zip');

    return { message: `Exported ${triesText(made.used)} as a dataset${leftOut(made)}` };
  },
};

const PUBLISH: Delivery = {
  busy: 'Publishing dataset…',
  failed: 'Couldn’t publish the dataset.',
  deliver: async (made) => {
    const files = await exportDatasetFiles(made.job);
    const published = await hubBridge.publish({ kind: 'dataset', name: made.name, files });

    return {
      message: `Published ${triesText(made.used)} to ${published.repo}${leftOut(made)}`,
      options: { action: { label: 'Open', onClick: () => window.open(published.url, '_blank', 'noopener') } },
    };
  },
};

const signedIn = () =>
  hubBridge.account().then(
    (a) => a.signedIn,
    () => false,
  );

export function useDatasetExport(options: DatasetExportOptions): DatasetExport {
  const { sim, rig, parts, active, tries, showToast, openAccounts } = options;
  const [exporting, setExporting] = useState(false);
  const passed = tries.filter((t) => t.passed);
  const ready = !!active && passed.length > 0;

  const run = async (kase: Case, delivery: Delivery) => {
    setExporting(true);
    showToast(delivery.busy, { tone: 'progress' });

    try {
      const made = await prepareDataset({ sim, rig, parts, kase, tries: passed });

      if (!made) {
        showToast('These tries are from an earlier design. Try It again to record new ones.', { tone: 'error' });

        return;
      }

      const done = await delivery.deliver(made);

      showToast(done.message, done.options);
    } catch (err) {
      showToast(`${delivery.failed} ${err instanceof Error ? err.message : String(err)}`, { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const publish = async (kase: Case) => {
    if (await signedIn()) await run(kase, PUBLISH);
    else openAccounts();
  };

  return {
    canExport: ready,
    canPublish: ready && !IS_WEB_DEMO,
    exporting,
    exportDataset: () => {
      if (active && ready && !exporting) void run(active, EXPORT);
    },
    publishDataset: () => {
      if (active && ready && !exporting && !IS_WEB_DEMO) void publish(active);
    },
    files: async (all) => {
      const made = active && (await prepareDataset({ sim, rig, parts, kase: active, tries: all }));

      return made ? exportDatasetFiles(made.job) : null;
    },
  };
}
