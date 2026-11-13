import { useState } from 'react';
import type { Case } from '../cases/schema';
import { sha256, type TryRecord } from '../cases/tries';
import { loadRecording } from '../cases/tryStore';
import type { DatasetJobEpisode } from '../datasets/buildDataset';
import { datasetCameras, snakeKey } from '../datasets/cameras';
import { exportDatasetZip } from '../datasets/datasetClient';
import { canExport } from '../datasets/episodes';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import type { Rig } from '../utils/kinematics';
import { fileSafe } from './helpers';
import type { ShowToast } from './types';

interface DatasetExportOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  tries: TryRecord[];
  showToast: ShowToast;
}

export interface DatasetExport {
  canExport: boolean;
  exporting: boolean;
  exportDataset: () => void;
  build: (tries: TryRecord[]) => Promise<DatasetZip | null>;
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

export interface DatasetZip {
  zip: Uint8Array;
  name: string;
  used: number;
  left: number;
}

type BuildInput = Pick<DatasetExportOptions, 'sim' | 'rig' | 'parts'> & { kase: Case; tries: TryRecord[] };

export async function buildDatasetZip({ sim, rig, parts, kase, tries }: BuildInput): Promise<DatasetZip | null> {
  const model = sim.model ?? (await sim.buildModel());
  const { episodes, modelHash } = await usableEpisodes(kase, tries, model);

  if (!episodes.length) return null;

  const visible = parts.filter((p) => p.visible && p.role === 'solid');
  const name = `${fileSafe(kase.name)}-dataset`;
  const zip = await exportDatasetZip({
    name,
    robotType: snakeKey(rig.robots[0]?.name ?? 'robot'),
    parts: visible,
    world: sim.worldParts,
    model,
    cameras: datasetCameras(visible, sim.worldParts),
    episodes,
    source: { app: 'basecase', case: kase.id, case_name: kase.name, model_hash: modelHash },
  });

  return { zip, name, used: episodes.length, left: tries.length - episodes.length };
}

export function useDatasetExport({ sim, rig, parts, active, tries, showToast }: DatasetExportOptions): DatasetExport {
  const [exporting, setExporting] = useState(false);
  const passed = tries.filter((t) => t.passed);

  const run = async (kase: Case) => {
    setExporting(true);
    showToast('Exporting dataset…', { tone: 'progress' });

    try {
      const made = await buildDatasetZip({ sim, rig, parts, kase, tries: passed });

      if (!made) {
        showToast('These tries are from an earlier design. Try It again to record new ones.', { tone: 'error' });

        return;
      }

      downloadBytes(made.zip, `${made.name}.zip`, 'application/zip');
      showToast(
        `Exported ${triesText(made.used)} as a dataset${made.left ? `, left out ${made.left} from an earlier design` : ''}`,
      );
    } catch (err) {
      showToast(`Couldn’t export the dataset. ${err instanceof Error ? err.message : String(err)}`, { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return {
    canExport: !!active && passed.length > 0,
    exporting,
    exportDataset: () => {
      if (active && passed.length && !exporting) void run(active);
    },
    build: (all) => (active ? buildDatasetZip({ sim, rig, parts, kase: active, tries: all }) : Promise.resolve(null)),
  };
}
