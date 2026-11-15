import { describe, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { LIGHTEN_HANDLERS } from './agentLightenRequests';
import { awaitPartModels } from './agentPartModels';

describe('lighten_part request', () => {
  it('calls the shared scene action once with the default retained share', async () => {
    const reply = { text: 'Lightened Shin.', mesh: new Float32Array([1, 2, 3]) };
    const lightenPart = vi.fn(async () => reply);

    expect(await LIGHTEN_HANDLERS.lighten_part({ id: ' shin ' }, { lightenPart })).toEqual({ text: reply.text });
    expect(lightenPart).toHaveBeenCalledExactlyOnceWith('shin', { targetShare: 0.5, minWallMm: undefined });
  });

  it('passes both settings and preserves a named Strength load-path refusal', async () => {
    const reply = { text: 'Shin has no Strength load path. Connect it to the robot before lightening it.' };
    const lightenPart = vi.fn(async () => reply);

    expect(
      await LIGHTEN_HANDLERS.lighten_part({ id: 'shin', target_share: 0.3, min_wall_mm: 1 }, { lightenPart }),
    ).toEqual(reply);
    expect(lightenPart).toHaveBeenCalledExactlyOnceWith('shin', { targetShare: 0.3, minWallMm: 1 });
  });

  it('refuses malformed payloads before running the shared scene action', async () => {
    const lightenPart = vi.fn();

    for (const id of [undefined, null, 1, {}, [], '', ' ', 'x'.repeat(201)])
      expect(await LIGHTEN_HANDLERS.lighten_part({ id }, { lightenPart })).toEqual({
        text: 'Choose a printed part to lighten.',
      });

    for (const target_share of [null, '0.5', 0, 1, -1, 2, NaN, Infinity, -Infinity])
      expect(await LIGHTEN_HANDLERS.lighten_part({ id: 'shin', target_share }, { lightenPart })).toEqual({
        text: 'Choose a target share greater than 0 and less than 1.',
      });

    for (const min_wall_mm of [null, '1.6', 0, 0.9, -1, NaN, Infinity, -Infinity])
      expect(await LIGHTEN_HANDLERS.lighten_part({ id: 'shin', min_wall_mm }, { lightenPart })).toEqual({
        text: 'Choose a minimum wall of at least 1 mm.',
      });

    expect(lightenPart).not.toHaveBeenCalled();
  });

  it('refuses lightening when a robot component model failed to load', async () => {
    const viewport = { meshesReady: async () => ['feetech-sts3215'] } as unknown as Viewport3DHandle;

    await expect(awaitPartModels('lighten_part', viewport)).rejects.toThrow('measure a box in its place');
  });
});
