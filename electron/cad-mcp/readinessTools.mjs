import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const answer = async (kind, args, timeout) => {
  try {
    const res = await bridge(kind, args, timeout);

    return text(res?.text || 'Nothing to report.');
  } catch (err) {
    return fail(err);
  }
};

export const getReadiness = {
  name: 'get_readiness',
  config: {
    title: 'Is it ready to build?',
    description:
      'The one verdict on whether this robot can really be built: every assembly, design, fit, printing and parts-list check together, as blockers and notes. Computed from the model, not opinion, and shown to the user live in the Build tab. Never tell the user a design is ready, buildable or clear to print unless this says READY TO BUILD. Run it before you finish any work that changed the model.',
    inputSchema: {},
  },
  handler: () => answer('readiness', {}, 240000),
};

export const disputeFinding = {
  name: 'dispute_finding',
  config: {
    title: 'Dispute a finding',
    description:
      "Use when you have evidence that a blocker from get_readiness is wrong. It records your reason beside the blocker for the user. It doesn't clear it: only the user can ignore a blocker. Never change the design to hide a blocker.",
    inputSchema: {
      key: z.string().describe('The key in square brackets in get_readiness'),
      reason: z.string().max(400).describe('The evidence: what you measured and why the check is wrong'),
    },
  },
  handler: (args) => answer('dispute_finding', args),
};

const SOURCE = z.object({
  claim: z.string().max(160).describe('The number or fact, e.g. "size 25.4 × 17.8 mm"'),
  url: z.string().url().describe('The datasheet or page that states it'),
});

const PRICE = z.object({
  usd: z.number().min(0),
  per: z.number().int().min(1).describe('Units the price buys'),
  store: z.string().max(80),
  url: z.string().url(),
  seen: z.string().describe('The date you saw it, YYYY-MM-DD'),
});

export const addSourcedItem = {
  name: 'add_sourced_item',
  web: true,
  config: {
    title: 'Add a sourced item',
    description:
      "Adds anything real to the BOM that find_parts doesn't have, after you've found it with WebSearch and WebFetch: a part, a material (wire, adhesive) or equipment (a charger, a tool). Never settle for a worse design because the catalog lacks something: find it and add it. It is listed under Added by Agent, Materials or Equipment, so the user can tell it apart from catalog parts. Prefer the maker's page or a distributor. The app opens the link itself to confirm the part number is on the page; it never opens Amazon, so an Amazon link waits for the user. A part that takes up space in the robot also needs import_maker_cad. Returns the catalog key to use.",
    inputSchema: {
      id: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
        .describe('maker-model in kebab case, e.g. adafruit-ws2812b-60'),
      kind: z.enum(['part', 'material', 'equipment']),
      name: z.string().max(80),
      maker: z.string().max(80),
      mpn: z.string().max(80).describe('The exact part number for this version'),
      spec: z.string().max(400).describe('What it is and the numbers that matter'),
      url: z.string().url().describe('The product page'),
      group: z.string().optional().describe('For a part: the find_parts group, e.g. Sensors'),
      mounting: z.string().max(400).optional(),
      weight_g: z.number().min(0).optional(),
      qty: z
        .number()
        .int()
        .min(0)
        .max(500)
        .optional()
        .describe('How many to add to the BOM, when no scene part carries it'),
      price: PRICE.optional(),
      sources: z.array(SOURCE).max(20).describe('A source for each number you rely on'),
    },
  },
  handler: ({ weight_g: weightG, ...rest }) => answer('add_sourced', { ...rest, weightG }),
};

export const importMakerCad = {
  name: 'import_maker_cad',
  web: true,
  config: {
    title: 'Import maker CAD',
    description:
      "Turns the maker's CAD file into a real part you can design around: exact mesh, size and mounting holes. Always try this before modelling a bought part yourself. Give a direct link to a STEP or IGES file, or a zip holding one. The file is converted in a sandbox and its size checked against expect_mm from the datasheet. Add the item first with add_sourced_item. Run it again with rotate to fix the part's orientation; the download is kept. Y is up in the catalog frame. Very large files may be too big for the built-in reader: then say so and model it from the maker's drawing with model_part.",
    inputSchema: {
      id: z.string().describe('The add_sourced_item id'),
      url: z.string().url().describe('Direct link to the STEP, IGES or zip'),
      expect_mm: z.array(z.number().positive()).length(3).describe('Overall size from the datasheet, in any order'),
      license: z.string().max(120).describe('As the maker states it, or "not stated"'),
      rotate: z
        .array(z.tuple([z.enum(['x', 'y', 'z']), z.number()]))
        .max(4)
        .optional()
        .describe('Rotation steps, e.g. [["x", 90]]'),
      member: z.string().max(200).optional().describe('In a zip, the file to use'),
    },
  },
  handler: ({ expect_mm: expectMm, ...rest }) => answer('import_cad', { ...rest, expectMm }, 240000),
};

const EDITS = new Set([
  'add_parts',
  'update_parts',
  'delete_parts',
  'mirror_parts',
  'model_part',
  'fasten',
  'mate',
  'define_joints',
  'set_build',
  'add_sourced_item',
  'import_maker_cad',
]);

const editsScene = (name, args) => EDITS.has(name) || (name === 'synthesize_linkage' && !!args?.insert);

export async function withBuildCheck({ name, args }, result) {
  if (!editsScene(name, args) || result?.isError) return result;

  try {
    const res = await bridge('readiness_line', {}, 5000);

    return res?.text ? { ...result, content: [...result.content, { type: 'text', text: res.text }] } : result;
  } catch {
    return result;
  }
}
