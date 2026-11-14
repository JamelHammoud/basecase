import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeDataset } from './datasetTools.mjs';

const schema = z.object(makeDataset.config.inputSchema);

describe('make_dataset schema', () => {
  it('takes try ids and a query', () => {
    expect(schema.safeParse({ ids: ['try-1', 'try_2'] }).success).toBe(true);
    expect(schema.safeParse({ query: 'Touch a Point', case: 'Touch a Point' }).success).toBe(true);
  });

  it('refuses an id that isn’t a try id', () => {
    expect(schema.safeParse({ ids: ['../library/keys'] }).success).toBe(false);
    expect(schema.safeParse({ ids: ['a'.repeat(129)] }).success).toBe(false);
    expect(schema.safeParse({ ids: [] }).success).toBe(false);
  });
});
