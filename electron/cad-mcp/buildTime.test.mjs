import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const bridge = vi.fn(async () => ({}));

vi.mock('./shared.mjs', () => ({
  VIEW: z.string(),
  bridge,
  fail: (error) => {
    throw error;
  },
  imageReply: (value) => value,
  text: (value) => value,
}));

describe('set_build hours payload', () => {
  it('validates hours and forwards them unchanged to the workspace', async () => {
    const { setBuild } = await import('./buildTools.mjs');
    const schema = z.object(setBuild.config.inputSchema);
    const payload = schema.parse({ budget_hours: 6 });

    await setBuild.handler(payload);
    expect(bridge).toHaveBeenCalledWith('set_build', expect.objectContaining({ budget_hours: 6 }));
    expect(schema.parse({ budget_hours: 0 }).budget_hours).toBe(0);
    expect(schema.safeParse({ budget_hours: -1 }).success).toBe(false);
    expect(schema.safeParse({ budget_hours: Infinity }).success).toBe(false);
  });
});
