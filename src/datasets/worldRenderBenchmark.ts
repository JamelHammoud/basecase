import { createRenderStage, disposeRenderStage, renderEpisode, videoCodec } from './renderVideos';
import { kitchenCameras, kitchenView, stationaryEpisode } from './worldRenderFixture';
import type { ImportedWorldView } from '../three/viewport/importedWorld';

async function measure(imported: ImportedWorldView | null) {
  const { model, recording } = stationaryEpisode(501);
  const codec = await videoCodec();
  const start = performance.now();
  const stage = await createRenderStage([], [], undefined, { imported });

  try {
    const result = await renderEpisode(stage, {
      model,
      recording,
      codec,
      cameras: kitchenCameras,
      fps: 30,
      frames: Array.from({ length: 300 }, (_, index) => Math.round((index * 50) / 30)),
    });

    return {
      milliseconds: performance.now() - start,
      bytes: Object.values(result.videos).reduce((sum, video) => sum + video.byteLength, 0),
    };
  } finally {
    disposeRenderStage(stage);
  }
}

export async function worldRenderBenchmark() {
  const imported = await kitchenView();
  const box = await measure(null);
  const kitchen = await measure(imported);

  return { seconds: 10, fps: 30, cameras: 2, box, kitchen, ratio: kitchen.milliseconds / box.milliseconds };
}
