import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { toleranceFixture } from '../utils/designParameters/tolerances.fixtures';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildDrawings } from './drawings';
import { jsonHash } from '../utils/geometryHash';

it('keeps authored local dimensions separate from rotated approximate extents and retains nominal geometry on deviation edits', async () => {
  const design = toleranceFixture();
  const project = {
    ...DEFAULT_PROJECT,
    designParameters: design.parameters,
    dimensionalRequirements: design.requirements,
  };
  const input = {
    parts: design.parts,
    sourceSnapshot: { parts: design.parts, project },
    source: { id: 'spacers', name: 'Spacer stack', fingerprint: jsonHash(project) },
    options: { frame: 'scene' as const, plane: 'xy' as const, scale: 1 },
  };
  const before = await buildDrawings(input);
  const files = unzipSync(before.bytes);
  const sheet = before.manifest.sheets[0];
  const annotation = sheet.authoredDimensions![0];

  expect(annotation.nominal).toBeCloseTo(30.3, 8);
  expect(annotation.tolerance).toEqual({ lower: -0.1, upper: 0.2 });
  expect(sheet.extents[0]).not.toBeCloseTo(annotation.nominal, 3);
  expect(strFromU8(files[sheet.svg])).toContain('~');
  expect(strFromU8(files[sheet.svg])).toContain('Lower / Upper');
  expect(before.manifest.numericalToleranceMm).toBeCloseTo(0.002, 8);

  const editedProject = {
    ...project,
    designParameters: design.parameters.map((parameter) => ({ ...parameter, tolerance: { lower: 0, upper: 0 } })),
  };
  const after = await buildDrawings({ ...input, sourceSnapshot: { parts: design.parts, project: editedProject } });

  expect(after.manifest.source.fingerprint).not.toBe(before.manifest.source.fingerprint);
  expect(after.manifest.sheets[0].geometryFingerprint).toBe(sheet.geometryFingerprint);
  expect(after.manifest.tolerances!.results[0].status).toBe('pass');

  const unbound = design.parts.map((part) => ({ ...part, dimensionBindings: undefined }));
  const declarationsOnly = { ...project, dimensionalRequirements: [] };
  const noInference = await buildDrawings({
    ...input,
    parts: unbound,
    sourceSnapshot: { parts: unbound, project: declarationsOnly },
  });

  expect(noInference.manifest.sheets.every((item) => !item.authoredDimensions)).toBe(true);
});
