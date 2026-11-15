import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { bridge, settledWrites } = vi.hoisted(() => ({ bridge: vi.fn(), settledWrites: vi.fn() }));

vi.mock('./pendingWrites.mjs', () => ({ settledWrites }));
vi.mock('./shared.mjs', async (original) => ({ ...(await original()), bridge }));

afterEach(() => vi.resetAllMocks());

describe('lighten_part', () => {
  it('validates a printed part and defaults to half its material', async () => {
    const { lightenPart } = await import('./lightenPart.mjs');
    const schema = z.object(lightenPart.config.inputSchema);

    expect(lightenPart.name).toBe('lighten_part');
    expect(schema.parse({ id: ' shin ' })).toEqual({ id: 'shin', target_share: 0.5 });
    expect(schema.parse({ id: 'shin', target_share: 0.3, min_wall_mm: 1.6 })).toEqual({
      id: 'shin',
      target_share: 0.3,
      min_wall_mm: 1.6,
    });

    for (const id of [undefined, null, 1, {}, [], '', ' ', 'x'.repeat(201)])
      expect(schema.safeParse({ id }).success).toBe(false);

    for (const target_share of [null, '0.5', 0, 1, -1, 2, NaN, Infinity, -Infinity])
      expect(schema.safeParse({ id: 'shin', target_share }).success).toBe(false);

    expect(schema.safeParse({ id: 'shin', min_wall_mm: 1 }).success).toBe(true);

    for (const min_wall_mm of [null, '1.6', 0, 0.9, -1, NaN, Infinity, -Infinity])
      expect(schema.safeParse({ id: 'shin', min_wall_mm }).success).toBe(false);
  });

  it('waits for scene writes and forwards the payload to the shared action', async () => {
    const { lightenPart } = await import('./lightenPart.mjs');
    const payload = z.object(lightenPart.config.inputSchema).parse({ id: 'shin', min_wall_mm: 1.6 });
    const writes = Promise.withResolvers();
    const reply = 'Lightened Shin.';

    settledWrites.mockReturnValue(writes.promise);
    bridge.mockResolvedValue({ text: reply });

    const response = lightenPart.handler(payload);

    expect(bridge).not.toHaveBeenCalled();
    writes.resolve();
    expect(await response).toEqual({ content: [{ type: 'text', text: reply }] });
    expect(bridge).toHaveBeenCalledExactlyOnceWith('lighten_part', payload, 300000);
    expect(settledWrites.mock.invocationCallOrder[0]).toBeLessThan(bridge.mock.invocationCallOrder[0]);
  });

  it('preserves the shared action’s load-path refusal and bridge failures', async () => {
    const { lightenPart } = await import('./lightenPart.mjs');
    const reason = 'Shin has no Strength load path. Connect it to the robot before lightening it.';

    bridge.mockResolvedValueOnce({ text: reason });
    expect(await lightenPart.handler({ id: 'shin', target_share: 0.5 })).toEqual({
      content: [{ type: 'text', text: reason }],
    });

    bridge.mockRejectedValueOnce(new Error('This scene was closed.'));
    expect(await lightenPart.handler({ id: 'shin', target_share: 0.5 })).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'This scene was closed.' }],
    });
  });
});
