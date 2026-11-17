import { expect, it } from 'vitest';
import { drawingDesign } from './drawing.fixtures';
import { drawingFiles, prepareDrawings } from './drawings';
import { DRAWING_LIMITS } from './drawingTypes';

const source = { id: 'bounds', name: 'Bounds', fingerprint: 'source' };
const options = { frame: 'part' as const, plane: 'xy' as const, scale: 0.2 };

it('refuses open, nonfinite, overlapping and zero-volume meshes through production preparation', async () => {
  const part = drawingDesign(0);
  const mesh = part.mesh!;
  const variants = [
    { ...mesh, indices: mesh.indices.slice(3) },
    { ...mesh, positions: mesh.positions.map((value, i) => (i === 5 ? Infinity : value)) },
    { ...mesh, indices: [...mesh.indices, ...mesh.indices.slice(0, 3)] },
    { ...mesh, indices: [mesh.indices[0], mesh.indices[2], mesh.indices[1], ...mesh.indices.slice(3)] },
    { ...mesh, positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2, 0, 2, 1] },
  ];

  for (const invalid of variants)
    await expect(prepareDrawings({ source, options, parts: [{ ...part, mesh: invalid }] })).rejects.toThrow();
});

it('bounds reported source triangles before touching oversized arrays', async () => {
  const part = drawingDesign(0);
  const indices = new Proxy(part.mesh!.indices, {
    get(target, field, receiver) {
      if (field === 'length') return (DRAWING_LIMITS.triangles + 1) * 3;

      return Reflect.get(target, field, receiver);
    },
  });

  await expect(
    prepareDrawings({ source, options, parts: [{ ...part, mesh: { ...part.mesh!, indices } }] }),
  ).rejects.toThrow('100,000 triangles');
});

it('bounds expanded output using buffer lengths without allocating an oversized fixture', async () => {
  const manifest = await prepareDrawings({ source, options, parts: [drawingDesign(0)] });
  const payload = new Proxy(new Uint8Array(1), {
    get(target, field) {
      if (field === 'length') return DRAWING_LIMITS.bytes + 1;

      return Reflect.get(target, field, target);
    },
  });

  expect(() => drawingFiles(manifest, { 'large.stl': payload })).toThrow('64 MB');
});

it('wraps long identities without changing document units or silently truncating text', async () => {
  const part = { ...drawingDesign(0), name: 'W'.repeat(180) };
  const manifest = await prepareDrawings({ source: { ...source, name: 'S'.repeat(180) }, options, parts: [part] });
  const files = drawingFiles(manifest, {});

  expect(files['drawings.pdf'].length).toBeGreaterThan(0);
  await expect(prepareDrawings({ source, options, parts: [{ ...part, name: 'W'.repeat(257) }] })).rejects.toThrow(
    '256 characters',
  );
});
