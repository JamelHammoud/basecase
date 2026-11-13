import type { MeshFiles } from '../three/componentMeshes';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import { FRAME_HEIGHT, FRAME_WIDTH, type DatasetCamera } from './cameras';
import { datasetJoints, episodeData, type DatasetSlot } from './episodes';
import { lerobotFiles, type DatasetEpisode } from './lerobot';
import { codecName, createRenderStage, disposeRenderStage, renderEpisode, videoCodec } from './renderVideos';

export interface DatasetJobEpisode {
  recording: Recording;
  task: string;
  source: Record<string, unknown>;
}

export interface DatasetJob {
  name: string;
  robotType: string;
  parts: ScenePart[];
  world: ScenePart[];
  meshes?: MeshFiles;
  model: SimModel;
  cameras: DatasetCamera[];
  episodes: DatasetJobEpisode[];
  slots?: DatasetSlot[];
  source: Record<string, unknown>;
}

export type DatasetFiles = Record<string, Uint8Array>;

export async function buildDataset(job: DatasetJob): Promise<DatasetFiles> {
  const codec = await videoCodec();
  const stage = await createRenderStage(job.parts, job.world, job.meshes);
  const episodes: DatasetEpisode[] = [];

  try {
    for (const e of job.episodes) {
      const data = episodeData(e.recording, job.model, e.task, job.slots);
      const rendered = await renderEpisode(stage, {
        model: job.model,
        recording: e.recording,
        frames: data.frames,
        cameras: job.cameras,
        codec,
      });

      episodes.push({ ...data, ...rendered, source: e.source });
    }
  } finally {
    disposeRenderStage(stage);
  }

  const { names, groups } = datasetJoints(job.model, job.slots);

  return lerobotFiles({
    robotType: job.robotType,
    jointNames: names,
    jointGroups: groups,
    videos: job.cameras.map((c) => ({ key: c.key, width: FRAME_WIDTH, height: FRAME_HEIGHT, codec: codecName(codec) })),
    episodes,
    source: job.source,
  });
}
