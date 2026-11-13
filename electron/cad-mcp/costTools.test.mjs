import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const calls = [];

vi.mock('./shared.mjs', async () => {
  const { z: zod } = await import('zod');

  return {
    VIEW: zod.string(),
    bridge: async (kind, payload, timeout) => {
      calls.push({ kind, payload, timeout });

      return { text: 'Arm for 1 target.' };
    },
    fail: (err) => ({ content: [{ type: 'text', text: String(err) }] }),
    text: (t) => ({ content: [{ type: 'text', text: t }] }),
  };
});

const { sizeArm } = await import('./costTools.mjs');

const schema = z.object(sizeArm.config.inputSchema);
const point = [0, -260, 0];

describe('size_arm', () => {
  it('forwards targets, payload and base to the renderer and returns its text', async () => {
    const args = { targets: [point], payload_g: 200, base: [10, 0, 0] };
    const res = await sizeArm.handler(args);

    expect(calls.at(-1)).toEqual({ kind: 'size_arm', payload: args, timeout: 120000 });
    expect(res.content[0].text).toBe('Arm for 1 target.');
  });

  it('takes 1 to 8 targets', () => {
    const parse = (n) => schema.safeParse({ targets: Array.from({ length: n }, () => point), payload_g: 200 }).success;

    expect([0, 1, 8, 9].map(parse)).toEqual([false, true, true, false]);
  });
});
