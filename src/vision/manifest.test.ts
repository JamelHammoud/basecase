import { describe, expect, it } from 'vitest';
import { validateVisionManifest } from './manifest';

export const testManifest = () => ({
  version: 1,
  id: 'tiny',
  kind: 'detect',
  adapter: 'generic',
  classes: ['person'],
  input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
  model: {
    owner: 'test',
    repo: 'tiny',
    revision: 'a'.repeat(40),
    file: 'model.onnx',
    sha256: 'b'.repeat(64),
    bytes: 128,
  },
});

describe('vision manifest', () => {
  it('accepts supported kinds and bounded model contracts', () => {
    for (const kind of ['detect', 'segment', 'keypoints', 'classify', 'depth']) {
      expect(validateVisionManifest({ ...testManifest(), kind }).kind).toBe(kind);
    }
  });

  it('refuses traversal, mutable revisions, malformed hashes and excessive allocations', () => {
    const base = testManifest();
    const attacks = [
      { ...base, id: 12 },
      { ...base, model: { ...base.model, owner: 12 } },
      { ...base, model: { ...base.model, file: '../secret.onnx' } },
      { ...base, model: { ...base.model, file: 'a/%2e%2e/secret.onnx' } },
      { ...base, model: { ...base.model, revision: 'main' } },
      { ...base, model: { ...base.model, sha256: 'b'.repeat(63) } },
      { ...base, model: { ...base.model, bytes: 1024 ** 3 } },
      { ...base, input: { ...base.input, width: 100000 } },
      { ...base, input: { ...base.input, std: [0, 1, 1] } },
    ];

    for (const attack of attacks) expect(() => validateVisionManifest(attack)).toThrow();
  });
});
