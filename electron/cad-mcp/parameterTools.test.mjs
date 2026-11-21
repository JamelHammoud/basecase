import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { updateParts, getScene } from './sceneTools.mjs';
import { bridge } from './shared.mjs';

vi.mock('./shared.mjs', async (original) => ({ ...(await original()), bridge: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('shared dimensions through existing agent tools', () => {
  it('validates and sends a complete declaration and binding transaction through update_parts', async () => {
    const parameterEdits = [
      { op: 'set', parameter: { name: 'width', unit: 'mm', value: 200 } },
      { op: 'bind', part: 'deck', binding: { kind: 'cad', target: 'width', unit: 'mm', expression: 'width' } },
      {
        op: 'bind',
        part: 'mount',
        binding: { kind: 'cad', target: 'spacing', unit: 'mm', expression: 'width - 40 mm' },
      },
    ];

    bridge.mockResolvedValue({ ok: true, summary: 'Updated shared dimensions.' });

    const payload = z.object(updateParts.config.inputSchema).parse({ parameterEdits });
    const result = await updateParts.handler(payload);

    expect(bridge).toHaveBeenCalledExactlyOnceWith('apply', { parameterEdits });
    expect(result.content[0].text).toBe('Updated shared dimensions.');
    expect(
      z.object(updateParts.config.inputSchema).safeParse({ parameterEdits: [{ op: 'insert', parts: [] }] }).success,
    ).toBe(false);
    expect(
      z
        .object(updateParts.config.inputSchema)
        .safeParse({ parameterEdits: [{ op: 'set', parameter: { name: 'width', unit: 'kg', value: 20 } }] }).success,
    ).toBe(false);
  });

  it('shows compact declarations and bindings even when ordinary scene lines use grouped summaries', async () => {
    const parts = Array.from({ length: 21 }, (_, index) => ({
      id: index ? `stock-${index}` : 'deck',
      name: 'Deck',
      kind: 'cad',
      color: '#999999',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      bounds: { min: [0, 0, 0], max: [160, 100, 6] },
      ...(index ? {} : { dimensions: [{ kind: 'cad', target: 'width', unit: 'mm', expression: 'width' }] }),
    }));

    bridge.mockResolvedValue({
      parts,
      bounds: { min: [0, 0, 0], max: [160, 100, 6], size: [160, 100, 6] },
      parameters: [{ name: 'width', unit: 'mm', value: 200 }],
    });

    const result = await getScene.handler({});

    expect(result.content[0].text).toContain('Parameters: [{"name":"width","unit":"mm","value":200}]');
    expect(result.content[0].text).toContain('Bound dimensions: deck:1');
    await updateParts.handler({
      updates: [{ id: 'deck', name: 'Deck' }],
      parameterEdits: [{ op: 'rename', name: 'width', to: 'span' }],
    });
    expect(bridge).toHaveBeenCalledTimes(1);
  });
});
