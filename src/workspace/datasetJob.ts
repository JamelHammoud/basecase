import { caseSlots, type Case } from '../cases/schema';
import { slotKeys } from '../cases/slots';
import { sha256, type TryRecord } from '../cases/tries';
import type { DatasetJobEpisode } from '../datasets/buildDataset';
import { datasetCameras, snakeKey } from '../datasets/cameras';
import type { DatasetSpec } from '../datasets/datasetClient';
import { usableTries } from '../datasets/usableTries';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import { fileSafe } from './helpers';

export interface DatasetScene {
  model: SimModel;
  robotName: string;
  parts: ScenePart[];
  world: ScenePart[];
  guests: ScenePart[];
}

export interface DatasetJobInput {
  scene: DatasetScene;
  kase: Case | null;
  name: string;
  task: string;
  records: TryRecord[];
  load?: (id: string) => Promise<Recording | null | undefined>;
}

export interface PreparedDataset {
  job: DatasetSpec;
  name: string;
  used: number;
  left: number;
  modelHash: string;
}

const REPO_STEM_MAX = 80;

export async function repoName(stem: string, key: string) {
  const safe = fileSafe(stem).slice(0, REPO_STEM_MAX).replace(/-$/, '');

  return `${safe}-${(await sha256(key)).slice(0, 6)}`;
}

function sourceOf(kase: Case | null, modelHash: string): Record<string, unknown> {
  if (!kase) return { app: 'basecase', model_hash: modelHash };

  return { app: 'basecase', case: kase.id, case_name: kase.name, model_hash: modelHash };
}

function slotsOf(kase: Case | null, model: SimModel) {
  if (!kase) return undefined;

  const slots = caseSlots(kase);
  const keys = slotKeys(model.robots, slots);

  return slots.flatMap((s, i) => (keys[i] ? [{ id: s.id, robot: keys[i] }] : []));
}

export async function prepareDataset(input: DatasetJobInput): Promise<PreparedDataset | null> {
  const { scene, kase, task } = input;
  const passed = input.records.filter((t) => t.passed);
  const { usable, modelHash } = await usableTries(passed, scene.model, input.load ? { load: input.load } : {});
  const episodes: DatasetJobEpisode[] = usable.map(({ record, recording }) => ({
    recording,
    task,
    source: {
      try: record.id,
      at: record.at,
      margin: record.margin,
      case_hash: record.manifest.caseHash,
      seed: record.manifest.seed,
      source: record.manifest.source ?? null,
    },
  }));

  if (!episodes.length) return null;

  const visible = [...scene.parts, ...scene.guests].filter((p) => p.visible && p.role === 'solid');
  const name = `${fileSafe(input.name)}-dataset`;
  const slots = slotsOf(kase, scene.model);
  const job: DatasetSpec = {
    name,
    robotType: snakeKey(scene.robotName),
    parts: visible,
    world: scene.world,
    model: scene.model,
    cameras: datasetCameras(visible, scene.world),
    episodes,
    ...(slots ? { slots } : {}),
    source: sourceOf(kase, modelHash),
  };

  return { job, name, used: episodes.length, left: passed.length - episodes.length, modelHash };
}
