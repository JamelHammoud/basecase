import { z } from 'zod';
import { formatRecipe, recipeIndex, searchRecipes } from './recipes/catalog.mjs';
import { text } from './shared.mjs';

const PORTS_NOTE =
  'Recipe modules echo their interfaces as PORT lines (name, position, outward axis, kind, diameter). Place them with placed(pos, r, prefix) instead of translate/rotate so the ports land in your part frame.';

export const findRecipes = {
  name: 'find_recipes',
  config: {
    title: 'Find recipes',
    description:
      'Searches the library of proven, tested OpenSCAD modules (in robotics.scad, plus mechanisms.scad): seam shells with lip, reveal and insert screw towers; sculpted split shells; bosses, counterbores, ribs, vents, bed chamfers, flanges; STS3215 / STS3250 servo cradles and U-links; a battery bay with hatch; a Raspberry Pi 5 tray; gears, GT2 pulleys, four-bar linkages, snap pins and a print-in-place hinge. ' +
      'Returns each match with its use, parameters, ports and a snippet that compiles. Call it before modelling any of these, then adapt the snippet in model_part instead of writing the feature from scratch. An empty query lists every recipe.',
    inputSchema: {
      query: z.string().max(80).describe('2-5 words, e.g. "servo joint", "battery hatch", "shell seam", "gear"'),
      limit: z.number().int().min(1).max(6).optional(),
    },
  },
  handler: async ({ query = '', limit = 3 }) => {
    if (!query.trim()) return text(`Recipes:\n${recipeIndex()}\n\n${PORTS_NOTE}`);

    const found = searchRecipes(query, limit);

    if (!found.length) return text(`No recipe matches "${query}". Recipes:\n${recipeIndex()}`);

    return text([...found.map(formatRecipe), PORTS_NOTE].join('\n\n'));
  },
};
