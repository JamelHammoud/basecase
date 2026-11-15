import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { findSkills } from './skillTools.mjs';

describe('find_skills input', () => {
  it('accepts an optional skill name and bounds the query', () => {
    const schema = z.object(findSkills.config.inputSchema).strict();

    expect(findSkills.name).toBe('find_skills');
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ query: 'Get up' }).success).toBe(true);
    expect(schema.safeParse({ query: 'a'.repeat(121) }).success).toBe(false);
    expect(schema.safeParse({ url: 'https://evil.example' }).success).toBe(false);
  });
});
