import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { worldTriangles } from '../three/meshMeasure';
import { drawingDesign, DRAWING_DESIGNS } from './drawing.fixtures';
import { buildDrawings } from './drawings';
import type { DrawingSheet } from './drawingTypes';

function stlCoordinates(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const coordinates: number[] = [];

  expect(bytes).toHaveLength(84 + count * 50);

  for (let triangle = 0; triangle < count; triangle++) {
    for (let coordinate = 0; coordinate < 9; coordinate++)
      coordinates.push(view.getFloat32(96 + triangle * 50 + coordinate * 4, true));
  }

  return coordinates;
}

function pdfLines(pdf: string) {
  return [...pdf.matchAll(/(\[.*?\]) 0 d ([\d.-]+) ([\d.-]+) m ([\d.-]+) ([\d.-]+) l S/g)].map((line) => ({
    hidden: line[1] !== '[]',
    a: [(Number(line[2]) * 25.4) / 72, 210 - (Number(line[3]) * 25.4) / 72],
    b: [(Number(line[4]) * 25.4) / 72, 210 - (Number(line[5]) * 25.4) / 72],
  }));
}

function assertPdfProjection(pdf: string, sheet: DrawingSheet) {
  const lines = pdfLines(pdf);
  const [width, height, depth] = sheet.extents;
  const scale = sheet.scale;
  const frontLabel = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm \(front\) Tj/.exec(pdf)!;
  const origin = [(Number(frontLabel[1]) * 25.4) / 72, 210 - (Number(frontLabel[2]) * 25.4) / 72 - 6];
  const dimensionTexts = [...pdf.matchAll(/\(([^()]*)\) Tj/g)].map((text) => text[1]);

  expect(pdf).toContain('/MediaBox [0 0 841.8898 595.2756]');
  expect(dimensionTexts).toContain(`~${Number(width.toFixed(4))}`);
  expect(dimensionTexts).toContain(`~${Number(height.toFixed(4))}`);
  expect(dimensionTexts).toContain(`~${Number(depth.toFixed(4))}`);

  for (const line of sheet.views[0].lines) {
    const expected = [
      origin[0] + line.a[0] * scale,
      origin[1] - line.a[1] * scale,
      origin[0] + line.b[0] * scale,
      origin[1] - line.b[1] * scale,
    ];

    expect(
      lines.some(
        (candidate) =>
          candidate.hidden === line.hidden &&
          [...candidate.a, ...candidate.b].every((n, i) => Math.abs(n - expected[i]) < 0.0001),
      ),
    ).toBe(true);
  }

  for (const hole of sheet.holes)
    expect(dimensionTexts.some((text) => text.includes(`~${Number(hole.diameterMm.toFixed(4))}`))).toBe(true);
}

it.each(DRAWING_DESIGNS.map(({ name }, index) => ({ name, index })))(
  'binds native STL, PDF coordinates and editable SVG to the production $name',
  async ({ index }) => {
    const part = drawingDesign(index);
    const before = structuredClone(part);
    const { bytes, manifest } = await buildDrawings({
      parts: [part],
      options: { frame: 'part', plane: 'xy', scale: 0.5 },
      source: { id: 'manufacturing', name: 'Manufacturing', fingerprint: 'snapshot' },
    });
    const files = unzipSync(bytes);
    const sheet = manifest.sheets[0];
    const geometry = files[sheet.geometryFile];
    const source = buildPartGroup({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false);
    const triangles = worldTriangles(source);

    releasePartGroup(source);
    expect(sheet.geometryFileFingerprint).toBe(createHash('sha256').update(geometry).digest('hex'));

    const exported = stlCoordinates(geometry);

    for (let at = 0; at < exported.length; at += 9) {
      const actual = [0, 3, 6].map((corner) => exported.slice(at + corner, at + corner + 3));

      for (let corner = 0; corner < 9; corner += 3) {
        const expected = [triangles[at + corner], -triangles[at + corner + 2], triangles[at + corner + 1]];

        expect(
          actual.some((point) => point.every((coordinate, axis) => Math.abs(coordinate - expected[axis]) < 0.0001)),
        ).toBe(true);
      }
    }

    const pdf = strFromU8(files['drawings.pdf']);
    const spec = DRAWING_DESIGNS[index];
    const endpoints = sheet.views[0].lines.flatMap((line) => [line.a, line.b]);

    for (const [x, y] of spec.centers) {
      const centerX = spec.mirrored ? part.dimensions.width - x : x;
      const radius = spec.radius ?? 2;

      expect(pdf).toContain(`~${radius * 2}    ${centerX}    ${y}`);

      for (const [dx, dy] of [
        [radius, 0],
        [-radius, 0],
        [0, radius],
        [0, -radius],
      ])
        expect(endpoints.some((point) => Math.hypot(point[0] - centerX - dx, point[1] - y - dy) < 0.002)).toBe(true);
    }

    for (const [x, y] of spec.outline) {
      const expectedX = spec.mirrored ? part.dimensions.width - x : x;

      expect(endpoints.some((point) => Math.hypot(point[0] - expectedX, point[1] - y) < 0.002)).toBe(true);
    }

    assertPdfProjection(pdf, sheet);
    expect(strFromU8(files[sheet.svg])).toContain(sheet.geometryFingerprint);
    expect(strFromU8(files[sheet.svg])).toContain(sheet.geometryFile);
    expect(part).toEqual(before);
  },
);
