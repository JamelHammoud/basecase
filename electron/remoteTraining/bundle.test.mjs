import { describe, expect, it } from 'vitest';
import { readBundle, sha256 } from './bundle.mjs';

function bundle() {
  const binary = Buffer.alloc(24);

  Buffer.from([127, 69, 76, 70, 2, 1]).copy(binary);
  binary.writeUInt16LE(62, 18);

  return {
    format: 'basecase-forge-linux-x64',
    files: ['forge-train', 'libmujoco.so.4.0.0'].map((name) => ({
      name,
      sha256: sha256(binary),
      data: binary.toString('base64'),
    })),
  };
}

describe('Linux Forge bundle', () => {
  it('accepts checked Linux x64 runtime files', () => {
    expect(Object.keys(readBundle(JSON.stringify(bundle())))).toEqual(['forge-train', 'libmujoco.so.4.0.0']);
  });

  it.each(['../forge-train', '/forge-train', 'forge-train.exe', 'libmujoco.so;id'])(
    'refuses hostile bundle name %s',
    (name) => {
      const input = bundle();

      input.files[0].name = name;
      expect(() => readBundle(JSON.stringify(input))).toThrow();
    },
  );

  it('refuses wrong architectures, corrupt hashes and incomplete bundles', () => {
    const input = bundle();
    const otherArchitecture = Buffer.from(input.files[0].data, 'base64');

    otherArchitecture.writeUInt16LE(183, 18);
    input.files[0] = {
      ...input.files[0],
      data: otherArchitecture.toString('base64'),
      sha256: sha256(otherArchitecture),
    };
    expect(() => readBundle(JSON.stringify(input))).toThrow('verification');
    input.files[0].data = bundle().files[0].data;
    expect(() => readBundle(JSON.stringify(input))).toThrow('verification');
    input.files.pop();
    expect(() => readBundle(JSON.stringify(input))).toThrow('format');
  });
});
