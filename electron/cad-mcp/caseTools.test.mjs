import { describe, expect, it, vi } from 'vitest';
import { bridge } from './shared.mjs';
import { runCase } from './caseTools.mjs';

vi.mock('./shared.mjs', async (original) => ({ ...(await original()), bridge: vi.fn() }));

describe('run_case reply', () => {
  it('keeps every failing seed and first trip frame alongside the filmstrip', async () => {
    const failedSeeds = [
      { seed: 3, firstTrip: { label: 'fell', frame: 72 } },
      { seed: 9, firstTrip: { label: 'missed', frame: 499 } },
    ];
    const data = { id: 'walk-without-falling', passes: 18, runs: 20, failedSeeds };

    vi.mocked(bridge).mockResolvedValue({
      text: 'Walk Without Falling',
      data,
      images: [{ view: 'Worst run', dataUrl: 'data:image/png;base64,AAAA' }],
    });

    const reply = await runCase.handler({ id: 'walk-without-falling' });

    expect(reply.structuredContent).toEqual(data);
    expect(reply.content).toContainEqual({ type: 'image', mimeType: 'image/png', data: 'AAAA' });
    expect(bridge).toHaveBeenCalledWith('run_case', { id: 'walk-without-falling' }, 300000);
  });
});
