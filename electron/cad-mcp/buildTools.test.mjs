import { describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => []);

vi.mock('./shared.mjs', async (original) => ({
  ...(await original()),
  bridge: async (kind, payload) => {
    sent.push({ kind, payload });

    return { extras: [] };
  },
}));

const { setBuild } = await import('./buildTools.mjs');

describe('set_build', () => {
  it('sends budget_hours to the app as the time budget', async () => {
    await setBuild.handler({ budget_hours: 6 });

    expect(sent.at(-1)).toEqual({ kind: 'set_build', payload: expect.objectContaining({ budgetHours: 6 }) });
  });

  it('takes 0 to clear it, and refuses a negative time', () => {
    expect(setBuild.config.inputSchema.budget_hours.parse(0)).toBe(0);
    expect(() => setBuild.config.inputSchema.budget_hours.parse(-1)).toThrow();
  });
});
