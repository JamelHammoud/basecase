import { expect, it } from 'vitest';
import { booleanPart, withResult } from '../booleans/parts';
import { booleanHash } from '../booleans/hash';
import { evaluateBoolean } from '../booleans/evaluate';
import { buildDrawings } from './drawings';
import { sheetPart } from './sheet.fixtures';

it('dimensions a real subtraction result and updates after rebuilding its cylindrical tool', async () => {
  const base = sheetPart({ dimensions: { width: 40, height: 3, depth: 30 } });
  const tool = sheetPart({
    id: 'hole',
    kind: 'cylinder',
    position: [5, 0, -4],
    dimensions: { width: 4, height: 6, depth: 4 },
  });
  const source = { id: 'bracket', name: 'Hip bracket', fingerprint: 'source' };
  const options = { frame: 'part' as const, plane: 'xz' as const, scale: 1 };
  const draft = booleanPart({ id: 'bracket', base, tools: [tool], op: 'subtract' });
  const made = withResult(draft, booleanHash(draft), await evaluateBoolean(draft));
  const first = await buildDrawings({ source, options, parts: [made] });
  const sheet = first.manifest.sheets[0];

  expect(sheet.extents).toEqual([40, 30, 3]);
  expect(sheet.holes).toHaveLength(1);
  expect(sheet.holes[0].center[0]).toBeCloseTo(25, 3);
  expect(sheet.holes[0].center[1]).toBeCloseTo(19, 3);
  expect(sheet.holes[0].diameterMm).toBeCloseTo(4, 3);

  const stale = {
    ...made,
    boolean: { ...made.boolean, operands: [base, { ...tool, dimensions: { width: 6, height: 6, depth: 6 } }] },
  };

  await expect(buildDrawings({ source, options, parts: [stale] })).rejects.toThrow('update the boolean geometry');

  const larger = booleanPart({
    id: 'bracket',
    base,
    tools: [{ ...tool, dimensions: { width: 6, height: 6, depth: 6 } }],
    op: 'subtract',
  });
  const rebuilt = withResult(larger, booleanHash(larger), await evaluateBoolean(larger));
  const second = await buildDrawings({ source, options, parts: [rebuilt] });

  expect(second.manifest.sheets[0].geometryFingerprint).not.toBe(sheet.geometryFingerprint);
  expect(second.manifest.sheets[0].holes[0].diameterMm).toBeCloseTo(6, 3);
});
