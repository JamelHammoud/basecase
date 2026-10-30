import { describe, expect, it } from 'vitest';
import { candidateRecipe, findPart, scadParameters } from './harvest.mjs';

const scene = {
  parts: [
    { id: 'plate', name: 'Plate', kind: 'cube' },
    {
      id: 'motor-mount',
      name: 'Motor Mount',
      note: 'Holds the motor on the base.\nPrint flat.',
      cad: { language: 'openscad', code: 'include <robotics.scad>\nw = 40;  t = 3;\nprinted_block([w, w, t]);' },
    },
  ],
};

describe('recipe harvesting', () => {
  it('finds a modeled part by id or name', () => {
    expect(findPart(scene, 'motor-mount')?.id).toBe('motor-mount');
    expect(findPart(scene, 'motor mount')?.id).toBe('motor-mount');
    expect(findPart(scene, 'plate')).toBeUndefined();
  });

  it('turns a part into a candidate recipe for review', () => {
    const part = findPart(scene, 'motor-mount');

    expect(scadParameters(part.cad.code)).toEqual(['w=40', 't=3']);

    const recipe = candidateRecipe(part, { ports: [{ name: 'top', kind: 'face' }], source: 'robot.json' });

    expect(recipe).toMatchObject({
      name: 'motor_mount',
      use: 'Holds the motor on the base.',
      ports: 'top (face)',
      expect: { ports: ['top'] },
      harvested: { from: 'robot.json', part: 'motor-mount' },
    });
  });
});
