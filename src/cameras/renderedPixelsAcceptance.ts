import type { ScenePart } from '../types/robotics';
import type { VisionManifest } from '../vision/manifest';
import { preprocess } from '../vision/preprocess';
import type { FixedCamera } from './fixed';
import { LiveStage } from './liveStage';
import { cameraViews } from './views';
import { visionBitmapCopier } from './visionFrames';

export async function renderedPixels(input: {
  parts: ScenePart[];
  cameras: FixedCamera[];
  model: VisionManifest['input'];
}) {
  const stage = new LiveStage();
  const canvas = new OffscreenCanvas(320, 240);
  const ctx = canvas.getContext('2d')!;
  const views = cameraViews(input.parts, [], input.cameras);
  const copy = visionBitmapCopier();

  try {
    stage.setViews(views);
    await stage.setScene(input.parts, []);
    await stage.draw(null, [{ key: views[0].key, target: { canvas, ctx } }]);
    stage.renderer.getContext().finish();

    const inference = copy(views[0].key, canvas);
    const tile = canvas.transferToImageBitmap();
    const pixels = new OffscreenCanvas(inference.width, inference.height);
    const context = pixels.getContext('2d')!;

    context.drawImage(inference, 0, 0);

    const sampled = preprocess(context.getImageData(0, 0, pixels.width, pixels.height), input.model);

    inference.close();
    tile.close();

    return { width: pixels.width, height: pixels.height, samples: [...sampled.data] };
  } finally {
    stage.dispose();
  }
}
