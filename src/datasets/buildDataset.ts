import { zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';
import type { MeshFiles } from '../three/componentMeshes';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import { FRAME_HEIGHT, FRAME_WIDTH, type DatasetCamera } from './cameras';
import { episodeData, robotJoints } from './episodes';
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
  source: Record<string, unknown>;
}

const STORED = /\.(mp4|parquet)$/;

export function zipDataset(name: string, files: Record<string, Uint8Array>): Uint8Array {
  const entries: Zippable = {};

  for (const [path, bytes] of Object.entries(files)) {
    entries[`${name}/${path}`] = [bytes, { level: STORED.test(path) ? 0 : 6 }];
  }

  return zipSync(entries);
}

export async function buildDataset(job: DatasetJob): Promise<Uint8Array> {
  const codec = await videoCodec();
  const stage = await createRenderStage(job.parts, job.world, job.meshes);
  const episodes: DatasetEpisode[] = [];

  try {
    for (const e of job.episodes) {
      const data = episodeData(e.recording, job.model, e.task);
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

  const files = lerobotFiles({
    robotType: job.robotType,
    jointNames: robotJoints(job.model).map((j) => j.name),
    videos: job.cameras.map((c) => ({ key: c.key, width: FRAME_WIDTH, height: FRAME_HEIGHT, codec: codecName(codec) })),
    episodes,
    source: job.source,
  });

  return zipDataset(job.name, files);
}
