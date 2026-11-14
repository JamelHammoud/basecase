import { describe, expect, it } from 'vitest';
import { codexLimit, fromStrict, strictSchema } from './codex.mjs';

const SCHEMA = {
  type: 'object',
  properties: {
    changed: { type: 'boolean' },
    title: { type: 'string', maxLength: 80 },
    notes: { type: 'string' },
    ideas: {
      type: 'array',
      maxItems: 3,
      items: { type: 'object', properties: { title: { type: 'string', pattern: '^[A-Z]' } }, required: ['title'] },
    },
  },
  required: ['changed', 'title'],
};

describe('Codex', () => {
  it('makes a lane schema strict: every key required, optional ones nullable, unsupported limits dropped', () => {
    const strict = strictSchema(SCHEMA);

    expect(strict.required).toEqual(['changed', 'title', 'notes', 'ideas']);
    expect(strict.additionalProperties).toBe(false);
    expect(strict.properties.title).toEqual({ type: 'string' });
    expect(strict.properties.notes.type).toEqual(['string', 'null']);
    expect(strict.properties.ideas.type).toEqual(['array', 'null']);
    expect(strict.properties.ideas.items).toEqual({
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false,
    });
  });

  it('turns the nulls it asked for back into missing keys', () => {
    expect(fromStrict({ changed: true, title: 'Fix', notes: null, ideas: [{ title: 'A' }] }, SCHEMA)).toEqual({
      changed: true,
      title: 'Fix',
      ideas: [{ title: 'A' }],
    });
  });

  it('knows a Codex usage limit from its message, and nothing else', () => {
    const now = Date.UTC(2026, 10, 13, 12);

    expect(codexLimit({ err: "You've hit your usage limit. Try again in 2 hours." }, now)).toEqual({
      until: now + 30 * 60 * 1000,
    });
    expect(codexLimit({ err: 'error: tests failed' }, now)).toBeNull();
  });
});
