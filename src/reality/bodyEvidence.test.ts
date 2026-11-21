import { describe, expect, it } from 'vitest';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import { evidenceApplicable, rememberBodyEvidence, readBodyEvidence, type BodyEvidencePorts } from './bodyEvidence';

function storage() {
  const content = new Map<string, Uint8Array>();
  const ports: BodyEvidencePorts = {
    encode: async (value) => new TextEncoder().encode(JSON.stringify(value)),
    decode: async (bytes) => JSON.parse(new TextDecoder().decode(bytes)),
    save: async (bytes) => {
      const key = String(content.size);

      content.set(key, bytes.slice());

      return key;
    },
    load: async (key) => content.get(key) ?? null,
  };

  return { ports, content };
}

const request = {
  source: { recording: 'run-a', unit: 'arm-a', scene: 'scene-a', modelHash: 'model-a' },
  run: { joints: ['shoulder', 'wrist'] },
} as BodyAnalysisRequest;

describe('retained body analysis evidence', () => {
  it('reopens exact inputs independently of later source mutations', async () => {
    const { ports } = storage();
    const input = { request: structuredClone(request), sourceKey: 'source-a', calibration: { active: 2 } };
    const ref = await rememberBodyEvidence(input, ports);

    input.request.source.unit = 'arm-b';
    input.calibration.active = 3;

    const restored = await readBodyEvidence(ref, ports);

    expect(restored?.request.source.unit).toBe('arm-a');
    expect(restored?.calibration).toEqual({ active: 2 });
    expect(evidenceApplicable(ref, { unit: 'arm-a', scene: 'scene-a', sourceKey: 'source-a' })).toBe(true);
    expect(evidenceApplicable(ref, { unit: 'arm-b', scene: 'scene-a', sourceKey: 'source-a' })).toBe(false);
    expect(evidenceApplicable(ref, { unit: 'arm-a', scene: 'scene-a', sourceKey: 'source-edited' })).toBe(false);
    expect(await readBodyEvidence(ref, ports)).toEqual(restored);
    expect(await readBodyEvidence({ ...ref, modelHash: 'other' }, ports)).toBeNull();
    expect(await readBodyEvidence({ ...ref, joints: [...ref.joints].reverse() }, ports)).toBeNull();
  });

  it('refuses missing, oversized and mismatched evidence without substituting another source', async () => {
    const { ports, content } = storage();
    const ref = await rememberBodyEvidence({ request, sourceKey: 'source', calibration: {} }, ports);

    content.clear();
    expect(await readBodyEvidence(ref, ports)).toBeNull();
    content.set(ref.content, new TextEncoder().encode(JSON.stringify({ request: { source: { recording: 'wrong' } } })));
    expect(await readBodyEvidence(ref, ports)).toBeNull();
    await expect(
      rememberBodyEvidence({ request, sourceKey: 'source', calibration: 'x'.repeat(8_388_608) }, ports),
    ).rejects.toThrow();
  });
});
