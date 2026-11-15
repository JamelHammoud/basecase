import type { VideoCodec } from 'mediabunny';
import type { ImportedWorldView } from '../three/viewport/importedWorld';
import type { MeshFiles } from '../three/componentMeshes';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import { FRAME_HEIGHT, FRAME_WIDTH, type DatasetCamera } from './cameras';
import { datasetJoints, episodeData, type DatasetSegment, type DatasetSlot } from './episodes';
import { datasetFiles } from './lerobotExport';
import type { DatasetEpisode, DatasetSpec, ScanSensor } from './lerobotRows';
import {
  codecName,
  createRenderStage,
  disposeRenderStage,
  renderEpisode,
  videoCodec,
  type RenderStage,
} from './renderVideos';
import { segmentRows } from './segmentRows';

export interface DatasetJobEpisode {
  recording: Recording;
  task: string;
  source: Record<string, unknown>;
  segments?: DatasetSegment[];
  split?: DatasetEpisode['split'];
}

export interface DatasetJob {
  name: string;
  robotType: string;
  parts: ScenePart[];
  world: ScenePart[];
  meshes?: MeshFiles;
  imported?: ImportedWorldView | null;
  model: SimModel;
  cameras: DatasetCamera[];
  episodes: DatasetJobEpisode[];
  slots?: DatasetSlot[];
  source: Record<string, unknown>;
}

export type DatasetFiles = Record<string, Uint8Array>;

export const scanSensors = (model: SimModel, parts: ScenePart[]): ScanSensor[] =>
  (model.scans ?? []).map((eye) => ({
    part: eye.part,
    name: parts.find((p) => p.id === eye.part)?.name ?? eye.part,
    rays: eye.cols,
    rangeM: eye.rangeM,
    rateHz: eye.scan?.rateHz ?? 0,
    fovDeg: eye.scan?.fovDeg ?? 0,
  }));

export async function buildDataset(job: DatasetJob): Promise<DatasetFiles> {
  const codec = await videoCodec();
  const stage = await createRenderStage(job.parts, job.world, job.meshes, { imported: job.imported });
  let spec: DatasetSpec;

  try {
    spec = await renderDataset(stage, job, codec);
  } finally {
    disposeRenderStage(stage);
  }

  return datasetFiles(spec);
}

export async function renderDataset(stage: RenderStage, job: DatasetJob, codec: VideoCodec): Promise<DatasetSpec> {
  const episodes: DatasetEpisode[] = [];

  for (const e of job.episodes) {
    const data = episodeData(e.recording, job.model, e.task, job.slots);
    const rendered = await renderEpisode(stage, {
      model: job.model,
      recording: e.recording,
      frames: data.frames,
      cameras: job.cameras,
      codec,
    });

    const segments = segmentRows(e.segments ?? [], data.frames);

    episodes.push({
      ...data,
      ...rendered,
      source: e.source,
      ...(e.split ? { split: e.split } : {}),
      ...(segments.length ? { segments } : {}),
    });
  }

  const { names, groups } = datasetJoints(job.model, job.slots);

  return {
    robotType: job.robotType,
    jointNames: names,
    jointGroups: groups,
    videos: job.cameras.map((c) => ({ key: c.key, width: FRAME_WIDTH, height: FRAME_HEIGHT, codec: codecName(codec) })),
    episodes,
    source: job.source,
    scans: scanSensors(job.model, job.parts),
  };
}
