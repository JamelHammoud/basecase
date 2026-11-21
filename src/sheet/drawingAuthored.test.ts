import { DEFAULT_PROJECT } from '../types/robotics';
import { expect, it } from 'vitest';
import { addRectangle } from '../utils/sketch/edit';
import { GROUND_PLANE, partFromSolid, sketchSolid } from '../utils/sketch/placement';
import { sheetPart } from './sheet.fixtures';
import { prepareDrawings } from './drawings';

it('retains authored Sketch references only while the rebuilt source matches the current geometry', async () => {
  const rectangle = addRectangle(
    { points: [], entities: [], constraints: [] },
    { corner: { at: [-20, -10] }, opposite: [20, 10], width: 40, height: 20 },
  )!;
  const solid = sketchSolid(
    GROUND_PLANE,
    { sketch: rectangle.sketch, mode: 'extrude', depth: 3 },
    { id: 'node', name: 'Plate', color: '#777777' },
  )!;
  const part = partFromSolid(sheetPart({ kind: 'custom_model' }), solid);
  const input = {
    parts: [part],
    source: { id: 'sketch', name: 'Sketch plate', fingerprint: 'source' },
    options: { frame: 'part' as const, plane: 'xz' as const, scale: 1 },
  };
  const original = await prepareDrawings(input);

  expect(original.sheets[0].authoredSketch).toEqual({
    entities: rectangle.sketch.entities.map((entity) => entity.id),
    depthMm: 3,
  });

  const changed = await prepareDrawings({
    ...input,
    parts: [{ ...part, dimensions: { ...part.dimensions, width: 60 } }],
  });

  expect(changed.sheets[0].authoredSketch).toBeUndefined();
  expect(changed.sheets[0].geometryFingerprint).not.toBe(original.sheets[0].geometryFingerprint);
});

it('refuses stale supplied sheet thickness and retains a missing material as unknown', async () => {
  const source = { id: 'plate', name: 'Plate', fingerprint: 'source' };
  const options = { frame: 'part' as const, plane: 'xy' as const, scale: 1 };
  const part = sheetPart({ dimensions: { width: 80, height: 60, depth: 3 } });

  await expect(
    prepareDrawings({ source, options, parts: [{ ...part, sheet: { material: 'acrylic', thicknessMm: 4 } }] }),
  ).rejects.toThrow('current sheet thickness');

  const result = await prepareDrawings({ source, options, parts: [part] });

  expect(result.sheets[0].material).toBeNull();
});

it('retains the declared print material and never infers a material grade from a legacy process tag', async () => {
  const part = sheetPart();
  const project = { ...DEFAULT_PROJECT, material: 'ABS' as const };
  const source = { id: 'material', name: 'Material', fingerprint: 'source' };
  const options = { frame: 'part' as const, plane: 'xy' as const, scale: 0.2 };
  const printed = await prepareDrawings({ source, options, parts: [part], sourceSnapshot: { parts: [part], project } });

  expect(printed.sheets[0].material).toBe('ABS');

  const cnc = { ...part, mechanicalTag: 'CNC Aluminum' };
  const unknownGrade = await prepareDrawings({
    source,
    options,
    parts: [cnc],
    sourceSnapshot: { parts: [cnc], project },
  });

  expect(unknownGrade.sheets[0].material).toBe('Aluminum');
});
