import { serve, reply } from '../utils/workerRpc';
import { LiveStage } from '../cameras/liveStage';
import { sceneCamera } from '../datasets/cameras';
import type { BodyMotionPreview } from './bodyMotionTypes';
import type { SimModel } from '../sim/mjcfTypes';

let stage: LiveStage | null = null;
let preview: BodyMotionPreview | null = null;

serve({
  load: async (input: BodyMotionPreview) => {
    stage?.dispose();
    stage = new LiveStage();
    preview = input;

    const model: SimModel = {
      bodies: input.bodies,
      xml: '',
      version: 2,
      initial: { values: {} },
      joints: [],
      robots: [],
      massKg: {},
    };

    stage.setModel(model);
    stage.setViews([sceneCamera(input.parts, [])]);
    await stage.setScene(input.parts, []);

    return reply(true);
  },
  frame: async (index: number) => {
    if (!stage || !preview || !Number.isInteger(index) || !preview.poses[index]) throw new Error('Can’t tell.');

    const bitmaps = await stage.shoot(Float64Array.from(preview.poses[index]), ['scene']);
    const bitmap = bitmaps.scene;

    return reply(bitmap, [bitmap]);
  },
});
