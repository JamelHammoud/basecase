import { LiveStage } from '../cameras/liveStage';
import type { CameraView } from '../cameras/views';
import type { SimModel, WorldItem } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';

export interface PersonCameraInput {
  parts: ScenePart[];
  world: WorldItem[];
  model: SimModel;
  view: CameraView;
  poses: Float64Array[];
}

let stage: LiveStage | null = null;

export async function personCameraChecks(input: PersonCameraInput | { close: true }) {
  if ('close' in input) {
    stage?.dispose();
    stage = null;

    return null;
  }

  stage ??= new LiveStage([64, 64]);
  stage.setModel(input.model);
  stage.setViews([input.view]);
  await stage.setScene(input.parts, input.world);

  const canvas = new OffscreenCanvas(64, 64);
  const ctx = canvas.getContext('2d')!;
  const results: Array<{ target: number; center: number[]; depth: number }> = [];

  for (const poses of input.poses) {
    const frame = await stage.training({
      key: input.view.key,
      poses,
      width: 64,
      height: 64,
      seed: 1,
      keypoints: [],
      labelsOnly: true,
      requireGeometry: true,
    });
    const id = frame.instances.find((instance) => instance.instance === 'observation-target')!.id;

    await stage.draw(poses, [{ key: input.view.key, target: { canvas, ctx } }]);
    results.push({
      target: frame.instanceIds.reduce((count, value) => count + Number(value === id), 0),
      center: Array.from(ctx.getImageData(32, 32, 1, 1).data),
      depth: frame.depth[32 * 64 + 32],
    });
  }

  return results;
}
