import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { updateParts } from './sceneTools.mjs';
import { sceneText } from './sceneText.mjs';

describe('agent sheet tools', () => {
  const schema = z.object(updateParts.config.inputSchema);
  const sheet = { material: 'carbon-fiber', thicknessMm: 2 };

  it('accepts and preserves sheet updates', () => {
    const request = { updates: [{ id: 'chest', sheet }] };

    expect(schema.parse(request)).toEqual(request);
  });

  it.each([null, {}, { ...sheet, material: 'steel' }, { ...sheet, thicknessMm: 0 }, { ...sheet, thicknessMm: '2' }])(
    'refuses malformed sheet requests %j',
    (value) => expect(schema.safeParse({ updates: [{ id: 'chest', sheet: value }] }).success).toBe(false),
  );

  it('reports sheet material and thickness in get_scene', () => {
    const text = sceneText({
      frame: 'mm, Z up',
      parts: [{ id: 'chest', name: 'Chest', kind: 'box', position: [0, 0, 1], sheet }],
    });

    expect(text).toContain('sheet=carbon-fiber:2mm');
  });
});
