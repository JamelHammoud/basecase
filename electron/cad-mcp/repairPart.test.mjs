import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { bridge, settledWrites } = vi.hoisted(() => ({ bridge: vi.fn(), settledWrites: vi.fn() }));

vi.mock('./pendingWrites.mjs', () => ({ settledWrites }));
vi.mock('./shared.mjs', async (original) => ({ ...(await original()), bridge }));

afterEach(() => vi.resetAllMocks());

describe('repair_part', () => {
  it('validates a target part id and forwards the payload after scene writes finish', async () => {
    const { repairPart } = await import('./buildTools.mjs');
    const schema = z.object(repairPart.config.inputSchema);
    const payload = schema.parse({ id: 'left-shoulder-servo' });
    const reply = 'Opened repair guide for Left Shoulder Servo.';
    const writes = Promise.withResolvers();

    settledWrites.mockReturnValue(writes.promise);
    bridge.mockResolvedValue({ text: reply });

    expect(repairPart.name).toBe('repair_part');
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ id: '' }).success).toBe(false);
    expect(schema.safeParse({ id: ' ' }).success).toBe(false);
    expect(schema.safeParse({ id: 4 }).success).toBe(false);
    expect(schema.safeParse({ id: 'x'.repeat(201) }).success).toBe(false);

    const response = repairPart.handler(payload);

    expect(bridge).not.toHaveBeenCalled();
    writes.resolve();
    expect(await response).toEqual({ content: [{ type: 'text', text: reply }] });
    expect(settledWrites).toHaveBeenCalledWith();
    expect(bridge).toHaveBeenCalledExactlyOnceWith('repair_part', { id: 'left-shoulder-servo' }, 300000);
    expect(settledWrites.mock.invocationCallOrder[0]).toBeLessThan(bridge.mock.invocationCallOrder[0]);
  });

  it('returns the shared repair flow’s unavailable reason and bridge failures', async () => {
    const { repairPart } = await import('./buildTools.mjs');
    const reason = 'Couldn’t find a removal path for Left Shoulder Servo.';

    bridge.mockResolvedValueOnce({ text: reason });
    expect(await repairPart.handler({ id: 'left-shoulder-servo' })).toEqual({
      content: [{ type: 'text', text: reason }],
    });

    bridge.mockRejectedValueOnce(new Error('This scene was closed.'));
    expect(await repairPart.handler({ id: 'left-shoulder-servo' })).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'This scene was closed.' }],
    });
  });
});
