import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { createHash } from 'node:crypto';
import { drawingDesign, DRAWING_DESIGNS } from './drawing.fixtures';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { worldTriangles } from '../three/meshMeasure';
import { buildDrawings } from './drawings';
import type { DrawingJob } from './drawingTypes';

function job(index = 0): DrawingJob {
  return {
    source: { id: 'design-1', name: 'Workshop rover', fingerprint: 'source-snapshot' },
    parts: [drawingDesign(index)],
    options: { frame: 'part', plane: 'xy', scale: 1 },
  };
}

describe('snapshot mechanical drawings', () => {
  it.each(DRAWING_DESIGNS.map(({ name }, index) => ({ name, index })))(
    'exports production geometry for $name',
    async ({ index }) => {
      const input = job(index);
      const before = structuredClone(input);
      const result = await buildDrawings(input);
      const files = unzipSync(result.bytes);
      const manifest = result.manifest;
      const sheet = manifest.sheets[0];
      const spec = DRAWING_DESIGNS[index];
      const part = input.parts[0];
      const production = buildPartGroup({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false);
      const geometry = worldTriangles(production);

      releasePartGroup(production);
      expect(sheet.extents).toEqual([part.dimensions.width, part.dimensions.height, part.dimensions.depth]);
      expect(sheet.geometryFingerprint).toBe(
        createHash('sha256').update(new Uint8Array(geometry.buffer)).digest('hex'),
      );
      expect(sheet.extents[2]).toBeCloseTo(spec.thickness, 4);
      expect(sheet.units).toBe('mm');
      expect(sheet.scale).toBe(1);
      expect(sheet.geometryFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(sheet.partIds).toEqual([`fabricated-${index}`]);
      expect(sheet.quantity).toBe(1);
      expect(manifest.source).toEqual(input.source);
      expect(strFromU8(files[sheet.svg])).toContain('width="297mm"');
      expect(strFromU8(files['drawings.pdf'])).toContain('/MediaBox [0 0 841.8898 595.2756]');
      expect(input).toEqual(before);

      if (index !== 6) {
        expect(sheet.thicknessMm).toBeCloseTo(spec.thickness, 4);
        expect(sheet.holes).toHaveLength(spec.centers.length);

        for (const [x, y] of spec.centers) {
          const expectedX = spec.mirrored ? part.dimensions.width - x : x;
          const hole = sheet.holes.find((item) => Math.hypot(item.center[0] - expectedX, item.center[1] - y) < 0.002);

          expect(hole?.diameterMm).toBeCloseTo((spec.radius ?? 2) * 2, 3);
        }
      }

      if (index === 6) expect(sheet.mode).toBe('outline-only');
    },
  );

  it('reconciles copies, preserves holes and marks fitted circles as measured approximations', async () => {
    const input = job();
    const first = input.parts[0];

    input.parts.push({ ...first, id: 'copy', position: [400, 0, 0], print: { copies: 2 } });

    const { manifest } = await buildDrawings(input);
    const [sheet] = manifest.sheets;

    expect(manifest.sheets).toHaveLength(1);
    expect(sheet.quantity).toBe(3);
    expect(sheet.partIds).toEqual(['fabricated-0', 'copy']);
    expect(sheet.holes).toHaveLength(4);
    expect(sheet.holes.map((hole) => hole.center)).toEqual(
      expect.arrayContaining([
        [10, 10],
        [70, 10],
        [10, 50],
        [30, 50],
      ]),
    );
    expect(sheet.holes.every((hole) => Math.abs(hole.diameterMm - 4) < 0.002 && hole.approximate)).toBe(true);
    expect(sheet.datum).toEqual([0, 0, 0]);
    expect(sheet.material).toBeNull();
  });

  it('updates dimensions and fingerprints after an ordinary dimension edit', async () => {
    const input = job();
    const first = await buildDrawings(input);

    input.parts = input.parts.map((part) => ({ ...part, dimensions: { ...part.dimensions, width: 100 } }));

    const second = await buildDrawings(input);

    expect(second.manifest.sheets[0].extents[0]).toBeCloseTo(100);
    expect(second.manifest.sheets[0].geometryFingerprint).not.toBe(first.manifest.sheets[0].geometryFingerprint);
  });

  it.each([
    { plane: 'xy' as const, extents: [80, 60, 3] },
    { plane: 'xz' as const, extents: [80, 3, 60] },
    { plane: 'yz' as const, extents: [60, 3, 80] },
  ])('keeps orthographic alignment and editable vector scale in $plane', async ({ plane, extents }) => {
    const input = job();

    input.options = { frame: 'part', plane, scale: 0.5 };

    const { bytes, manifest } = await buildDrawings(input);
    const files = unzipSync(bytes);
    const sheet = manifest.sheets[0];
    const svg = strFromU8(files[sheet.svg]);
    const pdf = strFromU8(files['drawings.pdf']);

    sheet.extents.forEach((extent, i) => expect(extent).toBeCloseTo(extents[i], 4));
    expect(sheet.views.map((view) => view.name)).toEqual(['front', 'top', 'right']);
    expect(svg).toContain('Scale 0.5:1');
    expect(pdf).toContain('Scale 0.5:1');

    const paths = [...svg.matchAll(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/g)];
    const longestHorizontal = Math.max(
      ...paths.filter((match) => match[2] === match[4]).map((match) => Math.abs(Number(match[1]) - Number(match[3]))),
    );

    expect(longestHorizontal).toBeCloseTo(Math.max(extents[0], extents[2]) * 0.5, 3);
    expect(sheet.views[0].lines.some((line) => !line.hidden)).toBe(true);
    expect(sheet.views.slice(1).some((view) => view.lines.some((line) => line.hidden))).toBe(true);
  });

  it('refuses nonfinite transforms, malformed meshes and oversized jobs', async () => {
    const nonfinite = job();

    nonfinite.parts[0].rotation[0] = NaN;

    await expect(buildDrawings(nonfinite)).rejects.toThrow();

    const invalid = job();

    invalid.parts[0].mesh!.indices[0] = 100000;

    await expect(buildDrawings(invalid)).rejects.toThrow();
    await expect(buildDrawings({ ...job(), parts: Array(257).fill(drawingDesign(0)) })).rejects.toThrow();
    await expect(
      buildDrawings({ ...job(), options: { frame: 'part', plane: 'xy', scale: Infinity } }),
    ).rejects.toThrow();
  });
});
