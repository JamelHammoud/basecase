import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

export const searchTries = {
  name: 'search_tries',
  config: {
    title: 'Search tries',
    description:
      'Searches every try and segment in the Library, across scenes, with the same query the Library’s search takes. ' +
      'Words match the Case, task, instruction, segment labels, tags, robot, source and input. ' +
      'Known facts filter: passed, failed or unjudged; a source (case, variation, real) or input (keys, gamepad, phone, camera, leader-arm…); a robot’s name; dates (today, yesterday, this week, last week, last 3 days); durations (over 30 s, under 2 min); faulted. ' +
      'like:<try id> or like:<try id>/<segment id> ranks the rest by motion, as More Like This does. ' +
      'Words also match what the tries’ cameras saw, when frames were embedded. ' +
      'Returns { ok, count, hits: [{ try, segment, label, robot, scene, at_s, end_s, verdict, seconds, started, match }] }, best first. ' +
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
