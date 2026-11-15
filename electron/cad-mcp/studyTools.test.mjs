import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { bridge } from './shared.mjs';
import { studyDesign } from './studyTools.mjs';

vi.mock('./shared.mjs', async (original) => ({ ...(await original()), bridge: vi.fn() }));

describe('study_design', () => {
  const schema = () => z.object(studyDesign.config.inputSchema);

  it('accepts joint knobs with bounded sampling and preserves the complete reply', async () => {
    const payload = {
      case: 'Touch the Dots',
      knobs: [
        { id: 'shoulder', kind: 'servo', joints: ['shoulder'], values: ['component:feetech-sts3215|c044'] },
        { id: 'power', kind: 'voltage', values: [7.4, 12] },
        { id: 'width', kind: 'dimension', part: 'sole', name: 'width', values: [30, 40] },
      ],
      cap: 24,
      seed: 7,
    };
    const result = { ok: true, text: '| Value | Weight |', designs: [{ passes: 8 }], rows: [{ metrics: {} }] };

    vi.mocked(bridge).mockResolvedValue(result);

    expect(schema().parse(payload)).toEqual(payload);

    const reply = await studyDesign.handler(payload);

    expect(reply.structuredContent).toEqual(result);
    expect(JSON.parse(reply.content[0].text)).toEqual(result);
    expect(bridge).toHaveBeenCalledWith('study_design', payload, 600000);
  });

  it('accepts the previous single parameter payload and rejects out of range study bounds', () => {
    const payload = { parameter: 'battery_offset', offsets_mm: [[10, 20, 30]] };

    expect(schema().parse(payload)).toEqual(payload);
    expect(schema().safeParse({ cap: 65 }).success).toBe(false);
    expect(schema().safeParse({ seed: 0.5 }).success).toBe(false);
    expect(schema().safeParse({ knobs: [{ id: 'x', kind: 'voltage', values: [Infinity] }] }).success).toBe(false);
  });
});
