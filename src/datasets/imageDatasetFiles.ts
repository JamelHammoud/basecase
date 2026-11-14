import { exportCoco } from '../vision/coco';
import type { VisionFrameSet } from '../vision/frameSet';
import { mergeFrameSets } from '../vision/mergeFrameSets';
import { exportYolo } from '../vision/yolo';

export interface ImageDatasetJob {
  sets: VisionFrameSet[];
  seed: number;
  name: string;
  extraFiles?: Record<string, Uint8Array>;
}

const under = (folder: string, files: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`${folder}/${path}`, bytes]));

export function imageDatasetFiles(job: ImageDatasetJob): Record<string, Uint8Array> {
  const set = mergeFrameSets(job.sets, job.seed);
  const readme = new TextEncoder().encode(
    `---\ntask_categories:\n- object-detection\n- image-segmentation\n---\n\n# ${set.name}\n\nCOCO files are in coco/. YOLO files are in yolo/. Both contain the same images and split. Depth values are millimeters.\n`,
  );

  return {
    'README.md': readme,
    ...job.extraFiles,
    ...under('coco', exportCoco(set)),
    ...under('yolo', exportYolo(set)),
  };
}
