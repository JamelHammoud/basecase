import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const names = z.array(z.string().min(1).max(4096)).min(1).max(10000).optional();

export const makeImages = {
  name: 'make_images',
  config: {
    title: 'Make Training Images',
    description:
      'Renders JPEG images with visible boxes, masks, named keypoints and millimeter depth from a Case. ' +
      'A seed varies declared object poses and colors, lighting, surfaces, distractors, camera tolerance and sensor noise. ' +
      'Saves the frame set as a Dataset in the Library for COCO or YOLO export. The active Case is used when case is omitted. ' +
      'Choose cameras by their view key or name, classes by name or kind:name, and a seed to reproduce the batch. ' +
      'Returns the frame set and Dataset ids, image count and per-class annotation counts, or a problem.',
    inputSchema: {
      case: z.string().min(1).max(120).optional(),
      count: z.number().int().min(1).max(10000),
      cameras: names,
      classes: names,
      seed: z.number().int().min(0).max(0xffffffff).optional(),
    },
  },
  handler: async (args) => {
    try {
      return text(await bridge('make_images', args, 600000));
    } catch (err) {
      return fail(err);
    }
  },
};
