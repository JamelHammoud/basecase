import { useRef, useState } from 'react';
import { caseSlots, type Case } from '../cases/schema';
import { sha256, type TryRecord } from '../cases/tries';
import type { DatasetJobEpisode } from '../datasets/buildDataset';
import { datasetCameras, snakeKey } from '../datasets/cameras';
import { exportDatasetFiles, exportDatasetZip, type DatasetSpec } from '../datasets/datasetClient';
import { usableTries } from '../datasets/usableTries';
import { slotKeys } from '../cases/slots';
import { hubBridge } from '../hub/hubBridge';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import type { Rig } from '../utils/kinematics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { fileSafe } from './helpers';
import type { ShowToast, ToastOptions } from './types';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';

interface DatasetExportOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  tries: TryRecord[];
  showToast: ShowToast;
  openAccounts: () => void;
  sceneId: string;
}

export interface DatasetExport {
  canExport: boolean;
  canPublish: boolean;
  exporting: boolean;
  exportDataset: () => void;
  publishDataset: () => void;
  zip: (tries: TryRecord[]) => Promise<Uint8Array | null>;
}

async function usableEpisodes(kase: Case, passed: TryRecord[], model: SimModel) {
  const { usable, modelHash } = await usableTries(passed, model);
  const episodes: DatasetJobEpisode[] = usable.map(({ record, recording }) => ({
    recording,
    task: kase.brief.trim() || kase.name,
    source: {
      try: record.id,
      at: record.at,
      margin: record.margin,
      case_hash: record.manifest.caseHash,
      seed: record.manifest.seed,
      source: record.manifest.source ?? null,
    },
  }));

  return { episodes, modelHash };
}

export const EARLIER_TRIES = 'These tries are from an earlier design. Try It again to record new ones.';

interface PreparedDataset {
  job: DatasetSpec;
  name: string;
  repo: string;
  used: number;
  left: number;
}

type PrepareInput = Pick<DatasetExportOptions, 'sim' | 'rig' | 'parts' | 'sceneId'> & {
  kase: Case;
  tries: TryRecord[];
};

const REPO_STEM_MAX = 80;

async function repoName(sceneId: string, kase: Case) {
  const stem = fileSafe(kase.name).slice(0, REPO_STEM_MAX).replace(/-$/, '');

  return `${stem}-${(await sha256(`${sceneId}/${kase.id}`)).slice(0, 6)}`;
}

async function prepareDataset(input: PrepareInput): Promise<PreparedDataset | null> {
  const { sim, rig, parts, kase, tries } = input;
  const model = sim.model ?? (await sim.buildModel());
  const { episodes, modelHash } = await usableEpisodes(kase, tries, model);

  if (!episodes.length) return null;

  const visible = [...parts, ...sim.guestParts].filter((p) => p.visible && p.role === 'solid');
  const name = `${fileSafe(kase.name)}-dataset`;
  const slots = caseSlots(kase);
  const keys = slotKeys(model.robots, slots);
  const job: DatasetSpec = {
    name,
    robotType: snakeKey(rig.robots[0]?.name ?? 'robot'),
    parts: visible,
    world: sim.worldParts,
    model,
    cameras: datasetCameras(visible, sim.worldParts),
    episodes,
    slots: slots.flatMap((s, i) => (keys[i] ? [{ id: s.id, robot: keys[i] }] : [])),
    source: { app: 'basecase', case: kase.id, case_name: kase.name, model_hash: modelHash },
  };

  return {
    job,
    name,
    repo: await repoName(input.sceneId, kase),
    used: episodes.length,
    left: tries.length - episodes.length,
  };
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

    return { message: `Exported ${plural(made.used, 'try', 'tries')} as a dataset${leftOut(made)}` };
  },
};

const PUBLISH: Delivery = {
  busy: 'Publishing dataset…',
  failed: 'Couldn’t publish the dataset.',
  deliver: async (made) => {
    const files = await exportDatasetFiles(made.job);
    const published = await hubBridge.publish({ name: made.repo, files });

    return {
      message: `Published to ${published.repo}${leftOut(made)}`,
      options: { action: { label: 'Open', onClick: () => window.open(published.url, '_blank', 'noopener') } },
    };
  },
};

export function useDatasetExport(options: DatasetExportOptions): DatasetExport {
  const { sim, rig, parts, active, tries, showToast, openAccounts, sceneId } = options;
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);
  const passed = tries.filter((t) => t.passed);
  const ready = !!active && passed.length > 0;
  const prepare = (kase: Case, from: TryRecord[]) => prepareDataset({ sim, rig, parts, sceneId, kase, tries: from });

  const run = async (kase: Case, delivery: Delivery) => {
    setExporting(true);
    showToast(delivery.busy, { tone: 'progress' });

    try {
      const made = await prepare(kase, passed);

      if (!made) {
        showToast(EARLIER_TRIES, { tone: 'error' });

        return;
      }

      const done = await delivery.deliver(made);

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

  const publish = async (kase: Case) => {
    if (await hubBridge.signedIn()) await run(kase, PUBLISH);
    else openAccounts();
  };

  return {
    canExport: ready,
    canPublish: ready && !IS_WEB_DEMO,
    exporting,
    exportDataset: () => {
      if (active && ready) void once(() => run(active, EXPORT));
    },
    publishDataset: () => {
      if (active && ready && !IS_WEB_DEMO) void once(() => publish(active));
    },
    zip: async (all) => {
      const made = active && (await prepare(active, all));

      return made ? exportDatasetZip(made.job) : null;
    },
  };
}
