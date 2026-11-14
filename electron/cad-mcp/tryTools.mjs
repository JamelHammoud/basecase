import { z } from 'zod';
import { bridge, fail, imageReply, text } from './shared.mjs';

export const searchTries = {
  name: 'search_tries',
  config: {
    title: 'Search tries',
    description:
      'Searches every try in the Library, across scenes, with the same query the Library’s search takes. ' +
      'Words match the Case, its task, the robot, the source and the input. ' +
      'Known facts filter: passed, failed or unjudged; a source (case, variation, real) or input (keys, gamepad, phone, camera, leader-arm…); a robot’s name; dates (today, yesterday, this week, last week, last 3 days); durations (over 30 s, under 2 min, at least 10 s); faulted. ' +
      'like:<try id> ranks the rest by motion, as More Like This does. ' +
      'Returns { ok, count, hits: [{ try, label, robot, scene, verdict, seconds, started, match }] }, best first. ' +
      'count is the matches found before limit, at most 200.',
    inputSchema: {
      query: z.string().min(1).max(300).describe('e.g. "failed grasp red block leader-arm last week"'),
      limit: z.number().int().min(1).max(200).optional().describe('At most this many hits, 50 by default'),
    },
  },
  handler: async (args) => {
    try {
      return text(await bridge('search_tries', args, 30000));
    } catch (err) {
      return fail(err);
    }
  },
};

const labelWrite = z.object({
  try: z.string().min(1).max(120),
  instruction: z
    .string()
    .max(500)
    .optional()
    .describe('The whole try’s task, e.g. "pick up the red block and put it on the plate"'),
  segments: z
    .array(z.string().max(500))
    .max(200)
    .optional()
    .describe('One instruction per segment, in order, e.g. "grasp the red block"; "" leaves one as it is'),
  tags: z.array(z.string().min(1).max(64)).max(32).optional().describe('Tags to add'),
});

export const labelTries = {
  name: 'label_tries',
  config: {
    title: 'Label tries',
    description:
      'Reads and writes the labels on tries in the Library. ' +
      'tries reads each try’s labels: its segments (the try split into steps like reach, grasp, lift, place, each with its own label and instruction), its quality flags, tags and instruction, with its filmstrip. A try not split yet is split before it answers. ' +
      'labels writes instructions and adds tags. An instruction is the task in words a person would say: "pick up the red block and put it on the plate" for the whole try, one per segment for its steps ("grasp the red block"). ' +
      'A segments list must have one entry per segment of that try. Writes happen before reads in the same call. ' +
      'Returns { ok, written, tries: [{ try, label, robot, verdict, seconds, frames, rate, instruction, tags, segments: [{ index, from_s, to_s, label, instruction }], flags: [{ kind, at, joint }] }], problems } and the filmstrips. ' +
      'Times are seconds from the try’s start; flags are joint-limit, frame-gap, effort, idle or model.',
    inputSchema: {
      tries: z.array(z.string().min(1).max(120)).min(1).max(8).optional().describe('Try ids to read'),
      labels: z.array(labelWrite).min(1).max(200).optional().describe('Labels to write, one entry per try'),
    },
  },
  handler: async (args) => {
    try {
      const { images, ...reply } = await bridge('label_tries', args, 60000);

      return imageReply({ text: JSON.stringify(reply), images }, '');
    } catch (err) {
      return fail(err);
    }
  },
};
