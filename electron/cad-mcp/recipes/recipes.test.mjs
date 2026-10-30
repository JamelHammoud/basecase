import { beforeAll, describe, expect, it } from 'vitest';
import { renderPart } from '../../cad-kernel/client.mjs';
import { RECIPES, formatRecipe, searchRecipes } from './catalog.mjs';
import { scadPortsParallel } from './scadPorts.mjs';

const cases = RECIPES.flatMap((recipe) => [
  { recipe, why: 'the snippet', code: recipe.code, ports: recipe.expect.ports },
  ...(recipe.checks ?? []).map((check) => ({ recipe, ...check })),
]);

let compiled = [];
let echoed = [];

beforeAll(async () => {
  const [results, batch] = await Promise.all([
    Promise.all(cases.map((c) => renderPart(c.recipe.language ?? 'openscad', c.code))),
    scadPortsParallel(cases.map((c) => c.code)),
  ]);

  compiled = results;
  echoed = batch.ports;
}, 180000);

function verdict(c, result) {
  if (c.empty) return result.ok ? `expected no overlap, got ${result.stats.volume} mm³` : '';

  if (!result.ok) return result.error;

  if (result.warnings.length) return result.warnings.join('\n');

  if (c.volumeBelow !== undefined)
    return result.stats.volume < c.volumeBelow ? '' : `overlap ${result.stats.volume} mm³`;

  return result.stats.volume > 0 ? '' : 'empty part';
}

describe('recipe library', () => {
  for (const recipe of RECIPES) {
    it(`${recipe.name} compiles in the kernel and reports its ports`, () => {
      cases.forEach((c, i) => {
        if (c.recipe !== recipe) return;

        expect(verdict(c, compiled[i]), `${recipe.name}: ${c.why}`).toBe('');

        const names = echoed[i].map((p) => p.name);

        expect(names, `${recipe.name}: ${c.why} ports`).toEqual(expect.arrayContaining(c.ports ?? []));
      });
    });
  }

  it('reports ports in the part frame through placed()', () => {
    const i = cases.findIndex((c) => c.recipe.name === 'placed');
    const boss = echoed[i].find((p) => p.name === 'lid_boss');

    expect(boss).toMatchObject({ pos: [0, 0, -2], axis: [0, 0, -1], kind: 'boss', d: 3 });
  });

  it('finds recipes by what they are for', () => {
    expect(searchRecipes('servo joint bracket').map((r) => r.name)).toContain('servo_u_link');
    expect(searchRecipes('battery hatch')[0].name).toBe('battery_bay');
    expect(searchRecipes('head shell seam').map((r) => r.name)).toContain('split_shell');
    expect(searchRecipes('raspberry pi mount')[0].name).toBe('pi5_tray');
    expect(searchRecipes('gear')[0].name).toBe('gear_pair');
    expect(searchRecipes('teapot')).toEqual([]);
    expect(searchRecipes('so-101 arm')[0].name).toBe('arm_template');
    expect(searchRecipes('biped legs')[0].name).toBe('biped_template');
    expect(formatRecipe(searchRecipes('biped')[0])).toContain('define_joints');
    expect(formatRecipe(RECIPES[0])).toContain('Example (compiles as written');
  });
});
