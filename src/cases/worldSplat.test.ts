import { describe, expect, it } from 'vitest';
import { glbOf, gzipped, splatPlyOf, spzOf, spzRawOf } from './worldFixtureFiles';
import { garageMesh, splatOn } from './worldFixtures';
import { splatFormatOf, worldFilesOf } from './worldImport';
import { readWorldFiles } from './worldFiles';
import { isSplatPly, readSplatPly } from './worldSplat';
import { readSpz } from './worldSpz';
import type { DroppedFile } from './worldTypes';

const file = (name: string, bytes: Uint8Array): DroppedFile => ({ name, bytes });
const text = (name: string, body: string) => file(name, new TextEncoder().encode(body));
const collider = () => file('garage.glb', glbOf(garageMesh()));
const splat = () => splatOn(garageMesh(), 2);

const refusal = (files: DroppedFile[]) =>
  readWorldFiles(files).then(
    () => 'read',
    (error: Error) => `${error.constructor.name}: ${error.message}`,
  );

const MESH_PLY = [
  'ply',
  'format ascii 1.0',
  'element vertex 3',
  'property float x',
  'property float y',
  'property float z',
  'element face 1',
  'property list uchar int vertex_indices',
  'end_header',
  '0 0 0',
  '1 0 0',
  '0 0 1',
  '3 0 1 2',
  '',
].join('\n');

function withCount(bytes: Uint8Array, points: number) {
  const out = bytes.slice();

  new DataView(out.buffer).setUint32(8, points, true);

  return out;
}

describe('Gaussian splats', () => {
  it('reads a 3DGS PLY and an SPZ to their point counts', async () => {
    const points = splat().positions.length / 3;

    expect(readSplatPly(file('s.ply', splatPlyOf(splat())))).toBe(points);
    expect(await readSpz(file('s.spz', await spzOf(splat())))).toBe(points);
  });

  it('never takes a mesh PLY for a splat', () => {
    const meshPly = text('chair.ply', MESH_PLY);
    const pointsOnly = text('cloud.ply', MESH_PLY.replace('element face 1', 'element face 0'));
    const noSplatProperties = splatPlyOf(splat()).slice();
    const at = new TextDecoder('latin1').decode(noSplatProperties).indexOf('f_dc_0');

    noSplatProperties.set(new TextEncoder().encode('red___'), at);

    expect(isSplatPly(meshPly.bytes)).toBe(false);
    expect(isSplatPly(pointsOnly.bytes)).toBe(false);
    expect(isSplatPly(noSplatProperties)).toBe(false);
    expect(splatFormatOf(meshPly)).toBeUndefined();
    expect(worldFilesOf([meshPly])).toEqual([]);
  });

  it('refuses an ASCII splat PLY', async () => {
    const ascii = text(
      'a.ply',
      'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\n' +
        'property float f_dc_0\nproperty float opacity\nproperty float scale_0\nproperty float rot_0\nend_header\n0 0 0 0 0 0 1\n',
    );

    expect(await refusal([collider(), ascii])).toBe('CaseFileError: Export a.ply as a binary little-endian PLY.');
  });

  it('refuses a splat PLY whose header claims more points than it holds', async () => {
    const bytes = splatPlyOf(splat());
    const header = new TextDecoder().decode(bytes.subarray(0, 100));
    const points = splat().positions.length / 3;
    const lying = (n: number) => {
      const out = new TextEncoder().encode(header.replace(`vertex ${points}`, `vertex ${n}`));

      return file('lying.ply', new Uint8Array([...out, ...bytes.subarray(100)]));
    };

    expect(await refusal([collider(), lying(points + 1)])).toBe('CaseFileError: lying.ply is damaged.');
    expect(await refusal([collider(), lying(4_000_000)])).toBe('CaseFileError: lying.ply has over 3,000,000 points.');
    expect(await refusal([collider(), file('cut.ply', bytes.subarray(0, bytes.length - 3))])).toBe(
      'CaseFileError: cut.ply is damaged.',
    );
  });

  it('refuses an SPZ that claims too many points', async () => {
    const big = file('big.spz', await gzipped(withCount(spzRawOf(splat()), 4_000_000)));

    expect(await refusal([collider(), big])).toBe('CaseFileError: big.spz has over 3,000,000 points.');
  });

  it('stops reading a gzip bomb past its points', async () => {
    const raw = spzRawOf({ positions: [0, 0, 0], colors: [1, 1, 1] });
    const bomb = new Uint8Array(raw.length + 16 * 1024 * 1024);

    bomb.set(raw);

    expect(await refusal([collider(), file('bomb.spz', await gzipped(bomb))])).toBe(
      'CaseFileError: bomb.spz holds more than its points.',
    );
    expect(await refusal([collider(), file('zeros.spz', await gzipped(new Uint8Array(1 << 20)))])).toBe(
      'CaseFileError: zeros.spz is damaged.',
    );
  });

  it('refuses an SPZ cut short, an old version or a file that isn’t gzip', async () => {
    const raw = spzRawOf(splat());
    const old = raw.slice();

    new DataView(old.buffer).setUint32(4, 1, true);

    expect(await refusal([collider(), file('cut.spz', await gzipped(raw.subarray(0, raw.length - 5)))])).toBe(
      'CaseFileError: cut.spz is damaged.',
    );
    expect(await refusal([collider(), file('old.spz', await gzipped(old))])).toBe(
      'CaseFileError: old.spz is a splat version Basecase can’t read.',
    );
    expect(await refusal([collider(), text('plain.spz', 'not gzip at all')])).toBe(
      'CaseFileError: plain.spz is damaged.',
    );
  });
});
