import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const names = z.array(z.string().min(1).max(120)).min(1).max(256).optional();

export const makeImages = {
  name: 'make_images',
  config: {
    title: 'Make training images',
    description:
      'Renders labelled training images from a Case using the scene camera views. Randomizes object poses, colors and lighting from a repeatable seed, saves the frame set as a dataset and opens it. ' +
      'Pass camera keys or labels and class names to limit what it renders. Omitted lists use every available camera or class. ' +
      'Returns { ok, frame_set, dataset, class_counts }, or { ok: false, problem }.',
    inputSchema: {
      case: z.string().min(1).max(120).optional().describe('Case id or name, the open Case when omitted'),
      count: z.number().int().min(1).max(1000).optional().describe('Image count, 20 when omitted'),
      cameras: names.describe('Camera keys or labels'),
      classes: names.describe('Class names'),
      seed: z.number().int().min(0).max(0xffffffff).optional().describe('Repeatable seed, 1 when omitted'),
    },
  },
  handler: async (args) => {
    try {
      return text(await bridge('make_images', args, 600000));
    } catch (error) {
      return fail(error);
    }
  },
};
