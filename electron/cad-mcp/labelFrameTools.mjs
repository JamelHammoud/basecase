import { z } from 'zod';
import { bridge, fail, imageReply } from './shared.mjs';

const id = z.string().regex(/^[\w-]{1,128}$/);
const point = z.object({ name: z.string().min(1).max(200), x: z.number(), y: z.number(), visible: z.boolean() });
const box = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);
const annotation = z.object({
  instance: z.string().min(1).max(256),
  classId: z.number().int().nonnegative(),
  box: box.optional(),
  polygons: z.array(z.array(z.number()).min(6).max(10000)).max(1000).optional(),
  mask: z
    .object({
      size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
      counts: z.array(z.number().int().nonnegative()).max(16777217),
    })
    .optional(),
  keypoints: z.array(point).max(256).optional(),
});

export const labelFrames = {
  name: 'label_frames',
  config: {
    title: 'Label frames',
    description:
      'Reads frames from a saved image frame_set and returns JPEG images, pixel dimensions, classes and annotations. Select up to 8 frame ids or omit frames for the first 8. Submit labels to replace annotations for those frames, with classId and a pixel box [x,y,width,height], polygon rings, or the existing complete mask annotation. All submitted labels are suggestions for human review. An optional classes array adds or renames classes by id. Returns the frames with their saved labels and images.',
    inputSchema: {
      frame_set: id.describe('Saved frame_set id from make_images or an image dataset'),
      frames: z.array(id).min(1).max(8).optional(),
      labels: z
        .array(z.object({ frame: id, annotations: z.array(annotation).max(1000) }))
        .min(1)
        .max(8)
        .optional(),
      classes: z
        .array(
          z.object({
            id: z.number().int().nonnegative(),
            name: z.string().min(1).max(200),
            keypoints: z.array(z.string().min(1).max(200)).max(256).optional(),
            objectId: id.optional(),
          }),
        )
        .max(1000)
        .optional(),
    },
  },
  handler: async (args) => {
    try {
      return imageReply(await bridge('label_frames', args, 60000), 'Read frames');
    } catch (error) {
      return fail(error);
    }
  },
};
