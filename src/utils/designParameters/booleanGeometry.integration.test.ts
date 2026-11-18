import { describe, expect, it, vi } from 'vitest';
import { specToPart } from '../../agent/agentScene';
import { booleanPart } from '../../booleans/parts';
import { staleBooleans } from '../../booleans/results';
import { surfaceOperands } from '../../booleans/operands';
import { measureTriangles } from '../../three/meshMeasure';
import { mountingFeature, partSoup } from '../sketch/fixtures/supportDesigns';
import { supportFingerprint } from '../sketch/support';
import { regenerateParameterGeometry } from './geometry';
import { prepareParameterEdit } from './transaction';
import { renameParameter } from './mutations';
import { readFile } from 'node:fs/promises';
import { forgetComponentMesh } from '../../three/componentMeshes';

const compile = vi.fn(async () => ({ ok: false, error: 'Unexpected CAD compilation' }));
const regenerate = async (job: Parameters<typeof regenerateParameterGeometry>[0]) =>
  structuredClone(await regenerateParameterGeometry(structuredClone(job)));
const services = { compile, regenerate, isCurrent: () => true };
const parameters = (value: number) => [{ name: 'width', unit: 'mm' as const, value }];

async function fixture() {
  const base = {
    ...specToPart({ id: 'base', shape: 'box', size: [60, 40, 10], position: [0, 0, 0] }),
    dimensionBindings: [{ kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
  };
  const tool = specToPart({ id: 'tool', shape: 'box', size: [10, 10, 8], position: [0, 0, -5] });
  const inner = booleanPart({ id: 'inner', base, tools: [tool], op: 'subtract' });
  const second = { ...tool, id: 'second', position: [15, -5, 0] as [number, number, number] };
  const root = booleanPart({ id: 'root', base: inner, tools: [second], op: 'subtract' });
  const prepared = await prepareParameterEdit(
    { parts: [root], parameters: parameters(60) },
    { ...services, verify: true },
  );
  const source = surfaceOperands(prepared.parts).find((part) => part.id === 'base')!;
  const feature = mountingFeature(source, {
    name: 'Sensor mount',
    feature: [10, 10, 3],
    holes: 0,
    offset: true,
  });

  return { parts: [...prepared.parts, { ...feature, dimensionBindings: undefined }], parameters: parameters(60) };
}

describe('shared dimensions inside boolean assemblies', () => {
  it('finishes nested cuts and supported sketches before returning one complete design across a clone boundary', async () => {
    const before = await fixture();
    const result = await prepareParameterEdit({ ...before, parameters: parameters(80) }, services);
    const [root, feature] = result.parts;

    expect(staleBooleans(result.parts)).toEqual([]);
    expect(root.dimensions.width).toBe(80);
    expect(measureTriangles(partSoup(root)).volumeMm3).toBeCloseTo(80 * 10 * 40 - 2 * 10 * 4 * 10, -1);

    const source = surfaceOperands(result.parts).find((part) => part.id === 'base')!;

    expect(feature.sketch!.support!.fingerprint).toBe(supportFingerprint(source));
    expect(feature.position[0] - before.parts[1].position[0]).toBeCloseTo(-10, 4);
    expect(before.parts[0].dimensions.width).toBe(60);
    expect(surfaceOperands(result.parts).find((part) => part.id === 'base')!.dimensions.width).toBe(80);
    expect(compile).not.toHaveBeenCalled();

    const renamed = renameParameter({ parts: result.parts, parameters: parameters(80) }, 'width', 'span');

    expect(staleBooleans(renamed.parts)).toEqual([]);
    expect(renamed.parts[0].mesh).toBe(root.mesh);
  });

  it('refuses an empty recut before replacing the source design', async () => {
    const base = {
      ...specToPart({ id: 'base', shape: 'box', size: [160, 40, 10], position: [0, 0, 0] }),
      dimensionBindings: [{ kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
    };
    const tool = specToPart({ id: 'tool', shape: 'box', size: [100, 100, 20], position: [0, 0, 0] });
    const root = booleanPart({ id: 'root', base, tools: [tool], op: 'subtract' });
    const before = await prepareParameterEdit(
      { parts: [root], parameters: parameters(160) },
      { ...services, verify: true },
    );
    const saved = JSON.stringify(before);

    await expect(prepareParameterEdit({ ...before, parameters: parameters(5) }, services)).rejects.toThrow(/root/);
    expect(JSON.stringify(before)).toBe(saved);
  });

  it('solves a shrinking supported cutout before recutting its shrinking bound source', async () => {
    const base = {
      ...specToPart({ id: 'base', shape: 'box', size: [80, 40, 10], position: [0, 0, 0] }),
      dimensionBindings: [{ kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
    };
    const cutout = mountingFeature(base, {
      name: 'Service opening',
      feature: [64, 80, -20],
      holes: 0,
      offset: false,
    });
    const width = cutout.sketch!.sketch.constraints.find(
      (constraint) => 'value' in constraint && constraint.value === 64,
    )!;
    const tool = {
      ...cutout,
      dimensionBindings: [
        { kind: 'sketch' as const, target: width.id, unit: 'mm' as const, expression: 'width - 16 mm' },
      ],
    };
    const root = booleanPart({ id: 'root', base, tools: [tool], op: 'subtract' });
    const before = await prepareParameterEdit(
      { parts: [root], parameters: parameters(80) },
      { ...services, verify: true },
    );
    const result = await prepareParameterEdit({ ...before, parameters: parameters(40) }, services);

    expect(staleBooleans(result.parts)).toEqual([]);
    expect(result.parts[0].dimensions.width).toBe(40);
    expect(measureTriangles(partSoup(result.parts[0])).volumeMm3).toBeCloseTo(16 * 10 * 40, -1);
    expect(
      surfaceOperands(result.parts).find((part) => part.id === tool.id)!.sketch!.sketch.constraints,
    ).toContainEqual({ ...width, value: 24 });
    expect(before.parts[0].dimensions.width).toBe(80);
  });

  it('loads the exact catalog mesh before recutting a boolean instead of using a placeholder box', async () => {
    const component = specToPart({ id: 'servo', catalog: 'component:feetech-sts3215|c018', position: [100, 0, 0] });
    const base = {
      ...specToPart({ id: 'base', shape: 'box', size: [10, 10, 10], position: [0, 0, 0] }),
      dimensionBindings: [{ kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
    };
    const bytes = await readFile(new URL('../../../public/parts/feetech-sts3215.glb', import.meta.url));
    const root = booleanPart({ id: 'root', base, tools: [component], op: 'union' });

    forgetComponentMesh(component.componentId!);

    const result = await prepareParameterEdit(
      { parts: [root], parameters: parameters(20) },
      {
        ...services,
        regenerate: (job) =>
          regenerate({
            ...job,
            meshFiles: { 'feetech-sts3215': bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
          }),
      },
    );
    const exactVolume = measureTriangles(partSoup(component)).volumeMm3;

    expect(measureTriangles(partSoup(result.parts[0])).volumeMm3).toBeCloseTo(exactVolume + 20 * 10 * 10, -1);
    expect(exactVolume).not.toBeCloseTo(
      component.dimensions.width * component.dimensions.height * component.dimensions.depth,
      -1,
    );
    expect(surfaceOperands(result.parts).find((part) => part.id === component.id)!.componentId).toBe(
      component.componentId,
    );
  });
});
