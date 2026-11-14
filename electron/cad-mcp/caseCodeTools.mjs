import { z } from 'zod';
import { CODE_SOURCE_MAX_BYTES } from '../caseCodeLimits.mjs';
import { fileSize } from '../fileSize.mjs';
import { bridge, fail, text } from './shared.mjs';

const CODE_LIMIT = fileSize(CODE_SOURCE_MAX_BYTES);

const ANCHORS = ['top-left', 'top', 'top-right', 'left', 'fill', 'right', 'bottom-left', 'bottom', 'bottom-right'];

const CASE = z.string().min(1).max(120).optional().describe('The Case’s id or name; the open Case when left out');
const PANEL = z.string().min(1).max(80).describe('The code panel’s id, a plain id such as piano or hud');

async function capture() {
  try {
    return (await bridge('capture_window', {}, 15000))?.dataUrl ?? null;
  } catch {
    return null;
  }
}

export function withCapture(reply, dataUrl) {
  const content = [{ type: 'text', text: JSON.stringify(reply, null, 1) }];
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl ?? '');

  if (m) content.push({ type: 'text', text: 'The running Case' }, { type: 'image', mimeType: m[1], data: m[2] });

  return { content };
}

export const writeCaseCode = {
  name: 'write_case_code',
  config: {
    title: 'Write a Case’s code',
    description:
      `Writes or replaces one code panel of a Case’s console: one HTML document with its script and style inline, at most ${CODE_LIMIT}, at most 4 per Case. ` +
      'It runs sandboxed and reaches the studio only through window.basecase (the reference is in the system prompt). Adds code to the console’s input when there’s room, so drive works. ' +
      'One undo step. Opens the Case running when it isn’t; a running Case reloads only this panel, so the sim, the try and the other panels keep going. ' +
      'About 2 s after the panel loads it returns { ok, case, panel, loaded, errors: [{ message, line }] (the first 10 uncaught, line in source), logs (the first 20 console lines), refused (bridge calls refused, with why) } and a capture of the running Case window, code panels included. ' +
      `loaded false with no errors means it didn’t load within 12 s. Fix every error and refused call, and check the capture, before you answer. { ok: false, problem } names the path parseCase refused, e.g. console.panels[2].source must be at most ${CODE_LIMIT}.`,
    inputSchema: {
      case: CASE,
      panel: PANEL,
      source: z.string().min(1).max(1_000_000).describe('The whole HTML document'),
      title: z.string().min(1).max(80).optional().describe('Title Case; shown above a panel in a column'),
      height: z.number().min(80).max(900).optional().describe('A column panel’s height; 320 when left out'),
      place: z
        .object({
          side: z.enum(['left', 'right']).optional().describe('A column beside the canvas'),
          size: z.number().min(200).max(720).optional().describe('The column’s width'),
          overlay: z.enum(ANCHORS).optional().describe('Over the canvas instead, anchored here'),
          width: z
            .number()
            .min(40)
            .max(1600)
            .optional()
            .describe('Overlay width; needed unless the anchor is top, bottom or fill'),
          height: z
            .number()
            .min(40)
            .max(1600)
            .optional()
            .describe('Overlay height; needed unless the anchor is left, right or fill'),
          pointer: z.boolean().optional().describe('Overlay takes clicks; they pass through to the canvas when false'),
        })
        .optional()
        .describe('Where the panel goes; kept when replacing a panel, the right column for a new one when left out'),
    },
  },
  handler: async (args) => {
    try {
      const reply = await bridge('write_case_code', args, 60000);

      return reply?.ok === false ? text(reply) : withCapture(reply, await capture());
    } catch (err) {
      return fail(err);
    }
  },
};

export const readCaseCode = {
  name: 'read_case_code',
  config: {
    title: 'Read a Case’s code',
    description:
      'Returns a code panel’s source with its title and place, or, with no panel named and more than one, the Case’s code panels: { id, title, place, bytes }. Read before you revise a panel you didn’t just write.',
    inputSchema: { case: CASE, panel: PANEL.optional() },
  },
  handler: async (args) => {
    try {
      return text(await bridge('read_case_code', args));
    } catch (err) {
      return fail(err);
    }
  },
};

export const deleteCaseCode = {
  name: 'delete_case_code',
  config: {
    title: 'Delete a Case’s code panel',
    description:
      'Takes one code panel out of a Case’s console, and out of its layout, as one undo step. Returns { ok, case, panel, panels } with the code panels left.',
    inputSchema: { case: CASE, panel: PANEL },
  },
  handler: async (args) => {
    try {
      return text(await bridge('delete_case_code', args));
    } catch (err) {
      return fail(err);
    }
  },
};
