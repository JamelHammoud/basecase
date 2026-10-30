import { FEATURE_RECIPES } from './featureRecipes.mjs';
import { MODULE_RECIPES } from './moduleRecipes.mjs';
import { TEMPLATE_RECIPES } from './templateRecipes.mjs';
import { formatTemplate } from './templates.mjs';

export const RECIPES = [...FEATURE_RECIPES, ...MODULE_RECIPES];

const ALL = [...RECIPES, ...TEMPLATE_RECIPES];

const STOP = new Set(['a', 'an', 'and', 'the', 'for', 'with', 'of', 'to', 'in', 'on', 'my', 'part', 'parts']);

const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);

function score(recipe, terms) {
  const name = recipe.name.toLowerCase();
  const tags = words(recipe.tags);
  const use = words(recipe.use);

  return terms.reduce((sum, term) => {
    const named = (name === term ? 10 : 0) + (name.includes(term) ? 3 : 0);
    const tagged = tags.some((t) => t === term || (term.length > 3 && t.startsWith(term))) ? 2 : 0;

    return sum + named + tagged + (use.includes(term) ? 1 : 0);
  }, 0);
}

export function searchRecipes(query, limit = 3) {
  const terms = words(query).filter((t) => t.length > 1 && !STOP.has(t));

  return ALL.map((recipe) => ({ recipe, s: score(recipe, terms) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ recipe }) => recipe);
}

export function formatRecipe(recipe) {
  if (recipe.template) {
    return [`## ${recipe.name}`, recipe.use, `Notes: ${recipe.notes}`, formatTemplate(recipe.template())].join('\n');
  }

  return [
    `## ${recipe.name}`,
    recipe.use,
    `Parameters: ${recipe.params}`,
    `Ports: ${recipe.ports}`,
    recipe.notes ? `Notes: ${recipe.notes}` : '',
    'Example (compiles as written; change the sizes to your design):',
    recipe.code,
  ]
    .filter(Boolean)
    .join('\n');
}

export const recipeIndex = () => ALL.map((r) => `- ${r.name}: ${r.use}`).join('\n');
