import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

export const TRY_ID = /^[\w-]{1,128}$/;

export const makeDataset = {
  name: 'make_dataset',
  config: {
    title: 'Make a dataset',
    description:
      'Gathers tries (from any scene, in the Library’s try store) into a versioned dataset the person exports as LeRobot, publishes to Hugging Face and trains on, then saves it and opens it in Tries. ' +
      'Use it when the person asks for a dataset of some tries. Pass one of query or ids, never both: query is the search search_tries takes, words, facts and like:<try id> alike, and keeps every try it finds; ids are try ids. ' +
      'Returns { ok, id, name, task, case, tries, query, left_out } where tries counts the tries it holds and left_out the ids no try matched, or { ok: false, problem }.',
    inputSchema: {
      query: z.string().min(1).max(200).optional().describe('e.g. "Touch a Point" or "failed grasp last week"'),
      ids: z.array(z.string().regex(TRY_ID)).min(1).max(10000).optional().describe('Try ids'),
      name: z.string().min(1).max(80).optional().describe('Title Case'),
      task: z
        .string()
        .min(1)
        .max(300)
        .optional()
        .describe('The instruction a policy trained on it reads, e.g. "Touch the red dot"'),
      case: z
        .string()
        .min(1)
        .max(120)
        .optional()
        .describe('The id or name of a Case in this scene that judges training on it'),
    },
  },
  handler: async (args) => {
    try {
      return text(await bridge('make_dataset', args, 120000));
    } catch (err) {
      return fail(err);
    }
  },
};
