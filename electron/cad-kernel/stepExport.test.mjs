import { afterAll, describe, expect, it } from 'vitest';
import { createNodeKernel } from './nodeHost/client.mjs';
import { exportStepFile } from './stepExport.mjs';
import { stepName } from './stepPolicy.mjs';

const kernel = createNodeKernel();
const occt = await (await import('occt-import-js')).default();

const at = (x) => [1, 0, 0, x, 0, 1, 0, 0, 0, 0, 1, 0];
const box = (size) => ({ type: 'box', size });
const body = (name, x, solid = box([10, 10, 10])) => ({ name, color: '#336699', place: at(x), solid });

const HOSTILE_NAMES = [
  "Bracket'); #1=CARTESIAN_POINT('x',(0.,0.,0.));",
  '../../../etc/passwd',
  'C:\\Windows\\system32\\drivers',
  'line\nbreak\r\n#99=PRODUCT();',
  '/* ENDSEC; */ END-ISO-10303-21;',
  '\\X2\\00410042\\X0\\',
  'Épaule 肩 \u0000\u202e',
];

function readBack(step) {
  const result = occt.ReadStepFile(new TextEncoder().encode(step), null);

  expect(result.success).toBe(true);

  return result.meshes.map((m) => {
    const p = m.attributes.position.array;
    const xs = p.filter((_, i) => i % 3 === 0);

    return { name: m.name, minX: Math.min(...xs), faces: m.brep_faces.length };
  });
}

afterAll(() => kernel.stopKernels());

describe('STEP export in the CAD kernel', () => {
  it('keeps a part name with path or STEP-escaping characters inside its own body', async () => {
    const bodies = HOSTILE_NAMES.map((name, i) => body(name, i * 20));
    const { step, skipped } = await exportStepFile(kernel, { name: "Scene'); ENDSEC;", bodies });
    const read = readBack(step);

    expect(skipped).toBe(0);
    expect(step.match(/^END-ISO-10303-21;$/gm)).toHaveLength(1);
    expect(step).not.toMatch(/#1=CARTESIAN_POINT\('x'/);
    expect(read.map((b) => b.name)).toEqual(HOSTILE_NAMES.map((name) => stepName(name, 'Part')));
    read.forEach((b, i) => expect(b.minX).toBeCloseTo(i * 20 - 5, 3));
    expect(read.every((b) => b.faces === 6)).toBe(true);
  }, 60_000);

  it('falls back to the mesh when a part’s code fails, and counts a part with neither', async () => {
    const [a, b, c, d] = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ];
    const tetra = [a, c, b, a, b, d, a, d, c, b, c, d].flat();
    const broken = { type: 'code', code: 'throw new Error("no");' };
    const { step, skipped } = await exportStepFile(kernel, {
      name: 'Scene',
      bodies: [
        { ...body('Saved', 0, broken), fallback: { type: 'mesh', positions: tetra } },
        body('Lost', 40, broken),
        body('Kept', 80),
      ],
    });

    expect(skipped).toBe(1);
    expect(readBack(step).map((b) => b.name)).toEqual(['Saved', 'Kept']);
  }, 60_000);

  it('builds booleans and moved primitives exactly', async () => {
    const plate = {
      type: 'boolean',
      op: 'subtract',
      solids: [box([40, 20, 6]), { type: 'cylinder', radii: [4, 4], height: 10 }],
    };
    const turned = { type: 'moved', matrix: [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0], solid: box([30, 10, 10]) };
    const { step } = await exportStepFile(kernel, {
      name: 'Scene',
      bodies: [body('Plate', 0, plate), body('Turned', 0, turned)],
    });
    const [holed, rotated] = readBack(step);

    expect(holed.faces).toBe(7);
    expect(rotated.minX).toBeCloseTo(-5, 3);
  }, 60_000);
});
