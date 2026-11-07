import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPartGlb } from '../../electron/cadImport/partGlb.mjs';
import { compressGlb, readGlb, viewBytes } from './meshopt.mjs';
import { writePartGlb } from './glb.mjs';

const FULL_SHA = '4e450fc1fbd78819e2d1aee20ccc3a912f32c46939166e022d4d6d05bd5bf609';
const REDUCED_SHA = 'cf859442c48926cd5f5e9282a8511fd09f53b53fd3404c113d6b615ab957095a';
const FIRST_VIEW_SHA = '168ea60d9860b8bdbe4dca82021d5fe866998567bb92986a09628b9a15b73518';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const dirs = [];

function sphereSoup(r, segments, offset) {
  const soup = [];
  const at = (i, j) => {
    const t = (Math.PI * i) / segments;
    const p = (2 * Math.PI * j) / segments;

    return [offset + r * Math.sin(t) * Math.cos(p), r * Math.cos(t), r * Math.sin(t) * Math.sin(p)];
  };

  for (let i = 0; i < segments; i++)
    for (let j = 0; j < segments; j++)
      soup.push(...at(i, j), ...at(i + 1, j), ...at(i + 1, j + 1), ...at(i, j), ...at(i + 1, j + 1), ...at(i, j + 1));

  return soup;
}

const groups = () => [
  { color: [0.2, 0.4, 0.8], soup: sphereSoup(10, 40, 0) },
  { color: [0.8, 0.31, 0.93], soup: sphereSoup(4, 12, 20) },
];

function withoutBuffer(run) {
  const saved = globalThis.Buffer;

  delete globalThis.Buffer;

  try {
    return run();
  } finally {
    globalThis.Buffer = saved;
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('parts pipeline GLB', () => {
  it('builds the same bytes as before it came off Buffer, with no Buffer in reach', () => {
    const { full, reduced } = withoutBuffer(() => ({
      full: buildPartGlb('fixture-spheres', groups(), { source: 'https://example.com/x' }),
      reduced: buildPartGlb('fixture-spheres', groups(), { triangleBudget: 1000 }),
    }));

    expect(full.glb).toBeInstanceOf(Uint8Array);
    expect(sha(full.glb)).toBe(FULL_SHA);
    expect(full).toMatchObject({ triangles: 3384, bytes: 18160, colors: 2 });
    expect(sha(reduced.glb)).toBe(REDUCED_SHA);
    expect(reduced.triangles).toBe(2826);
  });

  it('reads its own GLB from a Buffer or plain bytes, and never compresses twice', () => {
    const { glb } = buildPartGlb('fixture-spheres', groups(), {});

    for (const bytes of [glb, Buffer.from(glb)]) {
      const { json, bin } = readGlb(bytes);

      expect(json.meshes[0].name).toBe('fixture-spheres');
      expect(sha(viewBytes(json, bin, 0))).toBe(FIRST_VIEW_SHA);
    }

    expect(sha(compressGlb(glb))).toBe(sha(glb));
  });

  it('writes the same file through writePartGlb', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parts-glb-'));

    dirs.push(outDir);

    const result = writePartGlb('fixture-spheres', groups(), { source: 'https://example.com/x', outDir, stats: false });

    expect(sha(fs.readFileSync(path.join(outDir, 'fixture-spheres.glb')))).toBe(FULL_SHA);
    expect(result.size).toEqual([34, 20, 20]);
  });
});
