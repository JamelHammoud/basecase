import { afterAll, describe, expect, it } from 'vitest';
import { specToPart } from '../../agent/agentScene';
import type { ScenePart } from '../../types/robotics';
import type { RenderedCad } from '../platform/types';
import { partSoup } from '../sketch/fixtures/supportDesigns';
import { measureTriangles } from '../../three/meshMeasure';
import { regenerateParameterGeometry } from './geometry';
import { prepareParameterEdit } from './transaction';
import type { DesignParameter } from './types';

interface Kernel {
  renderPart: (language: string, code: string, options?: { expect?: Record<string, unknown> }) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(
  new URL('../../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href,
);
const kernel: Kernel = createNodeKernel();

afterAll(() => kernel.stopKernels());

const ASSEMBLIES = [
  { name: 'Rover chassis', width: 160, final: 180, depth: 100, height: 6, holes: [-60, 60], after: [-70, 70] },
  { name: 'Arm pedestal', width: 70, final: 90, depth: 70, height: 20, holes: [-15, 15], after: [-25, 25] },
  { name: 'Quadruped hip pair', width: 60, final: 80, depth: 44, height: 12, holes: [-10, 10], after: [-20, 20] },
  { name: 'Hexapod mounts', width: 180, final: 200, depth: 120, height: 8, holes: [-70, 70], after: [-80, 80] },
  { name: 'Pan tilt bracket', width: 56, final: 76, depth: 40, height: 6, holes: [-8, 8], after: [-18, 18] },
  { name: 'Gripper jaw', width: 64, final: 84, depth: 28, height: 8, holes: [-12, 12], after: [-22, 22] },
  { name: 'Enclosure lid', width: 100, final: 120, depth: 64, height: 4, holes: [-30, 30], after: [-40, 40] },
  { name: 'Wheel hub flange', width: 50, final: 70, depth: 50, height: 18, holes: [-5, 5], after: [-15, 15] },
  { name: 'Four bar mount', width: 120, final: 140, depth: 60, height: 10, holes: [-40, 40], after: [-50, 50] },
  { name: 'Service cover', width: 140, final: 160, depth: 100, height: 8, holes: [-50, 50], after: [-60, 60] },
];

function sourceCode(design: (typeof ASSEMBLIES)[number]) {
  return `width = ${design.width};
spacing = ${design.width - 40};
difference() {
  cube([width, ${design.depth}, ${design.height}], center=true);
  for (x = [-spacing/2, spacing/2]) translate([x,0,0]) cylinder(r=2,h=${design.height + 2},center=true,$fn=24);
}`;
}

async function sourcePart(design: (typeof ASSEMBLIES)[number]) {
  const code = sourceCode(design);
  const rendered = await kernel.renderPart('openscad', code);

  expect(rendered.ok, rendered.error).toBe(true);

  return {
    ...specToPart({
      id: 'plate',
      name: design.name,
      shape: 'cad_part',
      cad: { language: 'openscad', code, positions: rendered.positions!, indices: rendered.indices! },
    }),
    dimensionBindings: [
      { kind: 'cad' as const, target: 'width', unit: 'mm' as const, expression: 'width' },
      { kind: 'cad' as const, target: 'spacing', unit: 'mm' as const, expression: 'width - 40 mm' },
    ],
  };
}

function crossSections(part: ScenePart) {
  const positions = part.cad!.positions;
  const centers = new Map<number, number[]>();

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];

    if (Math.abs(z) > 0.0001) continue;

    const group = x < 0 ? -1 : 1;

    centers.set(group, [...(centers.get(group) ?? []), x]);
  }

  return [...centers.values()].map((values) => (Math.min(...values) + Math.max(...values)) / 2).sort((a, b) => a - b);
}

describe('real kernel shared dimension preparation', () => {
  it.each(ASSEMBLIES)(
    '$name compiles width and hole spacing once with independently expected hole centers',
    async (design) => {
      const source = await sourcePart(design);
      const parameters: DesignParameter[] = [{ name: 'width', unit: 'mm', value: design.final }];
      let compiled = 0;
      const result = await prepareParameterEdit(
        { parts: [source], parameters },
        {
          compile: (part, code) => {
            compiled += 1;

            return kernel.renderPart('openscad', code, { expect: part.cad?.expect });
          },
          regenerate: async (job) => regenerateParameterGeometry(job),
          isCurrent: () => true,
        },
      );
      const after = result.parts[0];
      const expectedVolume =
        design.final * design.depth * design.height - 2 * 12 * 4 * Math.sin(Math.PI / 12) * design.height;

      expect(compiled).toBe(1);
      expect(after.dimensions.width).toBeCloseTo(design.final, 4);
      expect(crossSections(source)).toEqual(design.holes);
      expect(crossSections(after)).toEqual(design.after);
      expect(measureTriangles(partSoup(after)).volumeMm3).toBeCloseTo(expectedVolume, -1);
      expect(source.cad!.code).toBe(sourceCode(design));
    },
  );
});

it.each([1, 16, 64])('prepares %s repeated CAD modules once each and retains unrelated geometry', async (count) => {
  const source = await sourcePart(ASSEMBLIES[0]);
  const modules = Array.from({ length: count }, (_, index) => ({ ...source, id: `deck-${index}` }));
  const stock = specToPart({ id: 'unchanged', shape: 'box', size: [10, 10, 10] });
  let compiled = 0;
  const result = await prepareParameterEdit(
    { parts: [...modules, stock], parameters: [{ name: 'width', unit: 'mm', value: 200 }] },
    {
      compile: (part, code) => {
        compiled += 1;

        return kernel.renderPart('openscad', code, { expect: part.cad?.expect });
      },
      regenerate: async (job) => regenerateParameterGeometry(job),
      isCurrent: () => true,
    },
  );

  expect(compiled).toBe(count);
  expect(result.metrics.compiled).toBe(count);
  expect(result.parts.at(-1)).toBe(stock);

  for (const part of result.parts.slice(0, count)) expect(part.dimensions.width).toBeCloseTo(200, 4);

  process.stdout.write(`parameter-cad-modules ${JSON.stringify({ count, ...result.metrics })}\n`);
});

it('refuses an actual kernel expectation failure without publishing any geometry', async () => {
  const source = await sourcePart(ASSEMBLIES[0]);
  const expected = { ...source, cad: { ...source.cad!, expect: { bodies: 2 } } };
  let geometry = 0;

  await expect(
    prepareParameterEdit(
      { parts: [expected], parameters: [{ name: 'width', unit: 'mm', value: 200 }] },
      {
        compile: (part, code) => kernel.renderPart('openscad', code, { expect: part.cad?.expect }),
        regenerate: async (job) => {
          geometry += 1;

          return regenerateParameterGeometry(job);
        },
        isCurrent: () => true,
      },
    ),
  ).rejects.toThrow(/bodies/);
  expect(geometry).toBe(0);
  expect(source.cad!.code).toContain('width = 160;');
});
