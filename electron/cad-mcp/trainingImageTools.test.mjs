import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeImages } from './trainingImageTools.mjs';

const schema = z.object(makeImages.config.inputSchema);

describe('make_images schema', () => {
  it('takes a Case with count, camera and class selections', () => {
    expect(
      schema.safeParse({ case: 'Pick Up a Block', count: 20, cameras: ['scene'], classes: ['Block'], seed: 42 })
        .success,
    ).toBe(true);
    expect(schema.safeParse({ count: 20 }).success).toBe(true);
    expect(
      schema.safeParse({ count: 20, classes: Array.from({ length: 512 }, (_, index) => `Class ${index}`) }).success,
    ).toBe(true);
  });

  it('refuses counts outside the batch limit and malformed selections', () => {
    for (const count of [0, -1, 1.5, 10001, Infinity, '20']) expect(schema.safeParse({ count }).success).toBe(false);

    expect(schema.safeParse({ count: 20, cameras: [] }).success).toBe(false);
    expect(schema.safeParse({ count: 20, classes: [''] }).success).toBe(false);
    expect(schema.safeParse({ count: 20, seed: -1 }).success).toBe(false);
  });
});
