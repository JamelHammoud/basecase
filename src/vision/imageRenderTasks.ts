import { reply } from '../utils/workerRpc';
import { provideMeshFiles, type MeshFiles } from '../three/componentMeshes';
import type { ImageSceneInput } from './imageScene';
import { ImageRenderer } from './renderImages';

export interface ImageSceneJob extends Omit<ImageSceneInput, 'seed'> {
  meshes: MeshFiles;
  classes?: string[];
}

export interface ImageSample {
  camera: string;
  seed: number;
}

let renderer: ImageRenderer | null = null;
let source: ImageSceneJob | null = null;

export function loadImages(job: ImageSceneJob) {
  renderer?.dispose();
  provideMeshFiles(job.meshes);
  source = job;
  renderer = new ImageRenderer();

  return reply(true);
}

export async function image(sample: ImageSample) {
  if (!renderer || !source) throw new Error('Load an image scene first.');

  const frame = await renderer.frame({ ...source, ...sample });

  return reply(frame, [frame.image.buffer, frame.depth.buffer]);
}
