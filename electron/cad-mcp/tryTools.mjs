import { z } from 'zod';
import { bridge, fail, imageReply, text } from './shared.mjs';

const tryId = z.string().regex(/^[\w-]{1,128}$/, 'a try id');
const words = z.string().trim().min(1).max(200);
const tags = z.array(z.string().trim().min(1).max(64)).max(32);

const segmentEdit = z.object({
  index: z.number().int().min(0).max(1999).describe('The segment’s index, from 0, as the read lists it'),
  label: words.optional().describe('A short name for the phase, e.g. "grasp"'),
  instruction: words
    .optional()
    .describe('The phase in words a person would say, e.g. "close the gripper on the block"'),
  tags: tags.optional().describe('Added to the segment’s tags'),
});

const tryEdit = z.object({
  id: tryId,
  instruction: words
    .optional()
    .describe('The whole task in words a person would say, e.g. "put the red block in the bowl"'),
  tags: tags.optional().describe('Added to the try’s tags; tags already there stay'),
  segments: z.array(segmentEdit).max(200).optional(),
});

export const labelTries = {
  name: 'label_tries',
  config: {
    title: 'Label tries',
    description:
      'Reads and labels tries: robot recordings kept in the tries store across scenes, which datasets and training read. ' +
      'With ids (up to 20) it returns, per try: id, robot, case, source, outcome, seconds, tags, instruction, and its segments (index, start and end in seconds, label, instruction, tags), ' +
      'with segments_from: stored (labelled before), rule (split by rule, when the try was recorded in this scene on this robot) or null (none), plus each try’s filmstrip, start to end, when there is one. ' +
      'With labels it writes: an instruction per try and per segment, and tags, which are added, never replaced; segment edits apply to the stored segments, or to the rule segments, which are then stored. ' +
      'Writes go first, then the read. Look at the filmstrip and segments before writing, and write instructions as the task in words a person would say. ' +
      'Returns { tries, written, problems } (each only when it has entries) with the images, or { ok: false, problem }. An unknown id is a problem, not a failure.',
    inputSchema: {
      ids: z.array(tryId).min(1).max(20).optional().describe('Tries to read'),
      labels: z.array(tryEdit).min(1).max(20).optional().describe('Labels to write'),
    },
  },
  handler: async (args) => {
    try {
      const res = await bridge('label_tries', args, 300000);

      return res?.ok === false ? text(res) : imageReply(res, 'No tries.');
    } catch (err) {
      return fail(err);
    }
  },
};
