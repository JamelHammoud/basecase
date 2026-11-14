import { cameraFeed } from '../cameras/viewsClient';
import type { CameraTrainingFrame } from '../cameras/trainingTypes';
import type { V3 } from '../utils/kinematics';
import { acceptanceBlock, acceptanceView } from './renderAcceptanceScene';

export interface TrainingBenchmarkResult {
  frames: number;
  width: number;
  height: number;
  milliseconds: number;
  measured: Array<{ position: V3; bounds: number[] | null }>;
}

function renderedBounds(frame: CameraTrainingFrame): number[] | null {
  const id = frame.instances.find((item) => item.instance === 'target')!.id;
  const edges = [frame.width, frame.height, 0, 0];
  let found = false;

  frame.instanceIds.forEach((value, pixel) => {
    if (value !== id) return;

    const x = pixel % frame.width;
    const y = Math.floor(pixel / frame.width);

    found = true;
    edges[0] = Math.min(edges[0], x);
    edges[1] = Math.min(edges[1], y);
    edges[2] = Math.max(edges[2], x + 1);
    edges[3] = Math.max(edges[3], y + 1);
  });

  return found ? edges : null;
}

export async function trainingLabelBenchmark(): Promise<TrainingBenchmarkResult> {
  const feed = cameraFeed();
  const base = { poses: null, key: acceptanceView.key, width: 640, height: 480, seed: 0, keypoints: [] };

  try {
    await feed.load({ parts: [acceptanceBlock()], world: [], model: null, views: [acceptanceView] });
    await feed.training(base);

    const start = performance.now();
    const measured: TrainingBenchmarkResult['measured'] = [];

    for (let index = 0; index < 1000; index++) {
      const position: V3 = [((index * 73) % 401) - 200, 150 + ((index * 37) % 81) - 40, ((index * 29) % 201) - 100];
      const frame = await feed.training({ ...base, seed: index, randomization: { objects: { target: { position } } } });

      if (index < 500) measured.push({ position, bounds: renderedBounds(frame) });
    }

    return { frames: 1000, width: 640, height: 480, milliseconds: performance.now() - start, measured };
  } finally {
    feed.dispose();
  }
}
