import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCase } from './caseTools.mjs';
import { makeImages } from './imageTools.mjs';

const schema = z.object(makeImages.config.inputSchema);

describe('make_images schema', () => {
  it('takes a Case and bounded rendering choices', () => {
    expect(
      schema.safeParse({ case: 'Blocks', count: 20, cameras: ['scene'], classes: ['block'], seed: 7 }).success,
    ).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it.each([{ count: 0 }, { count: 1.5 }, { count: 1001 }, { seed: -1 }, { cameras: [] }, { classes: [''] }])(
    'refuses malformed choices: %j',
    (payload) => expect(schema.safeParse(payload).success).toBe(false),
  );
});

describe('create_case image metadata schema', () => {
  it('keeps named points, color classes, camera tolerances and distractors', () => {
    const object = {
      name: 'Block',
      kind: 'box',
      position: [0, 0, 20],
      size: [40, 40, 40],
      behavior: 'dynamic',
      points: { tip: [0, 0, 20] },
      colors: [{ name: 'red-block', color: '#ff0000' }],
    };
    const payload = {
      goal: 'touch',
      objects: [object],
      imageRandomization: { cameraTolerance: { mm: 5, deg: 2 }, distractors: [object] },
    };

    expect(z.object(createCase.config.inputSchema).parse(payload)).toEqual(payload);
  });
});
