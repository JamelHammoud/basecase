import { describe, expect, it, vi } from 'vitest';
import { specToPart, applySpec } from '../../agent/agentScene';
import { findPort, worldPort } from '../../agent/ports';
import { planMate } from '../../agent/mate';
import { duplicateParts } from '../../workspace/useSelectionOps';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../../workspace/docHistory';
import { DEFAULT_PROJECT, type ScenePart } from '../../types/robotics';
import { generatedCad, supportDesign } from '../sketch/fixtures/supportDesigns';
import { regenerateParameterGeometry } from './geometry';
import { renameParameter, removeParameter } from './mutations';
import { prepareParameterEdit, type ParameterGeometryJob } from './transaction';
import type { DesignParameter } from './types';

const parameters: DesignParameter[] = [{ name: 'width', unit: 'mm', value: 100 }];
const deck = () => ({
  ...specToPart({ id: 'deck', shape: 'box', size: [80, 20, 6] }),
  dimensionBindings: [{ kind: 'primitive' as const, target: 'width', expression: 'width', unit: 'mm' as const }],
});
const compile = vi.fn(async () => ({ ok: false, error: 'Unexpected compilation' }));
const regenerate = async (job: ParameterGeometryJob) =>
  structuredClone(regenerateParameterGeometry(structuredClone(job)));

describe('parameter transaction isolation', () => {
  it('sends only connected parts for geometry work and preserves unrelated identities across a real clone boundary', async () => {
    const unrelated = supportDesign(0).feature;
    const input = [deck(), unrelated];
    const geometry = vi.fn(regenerate);
    const result = await prepareParameterEdit(
      { parts: input, parameters },
      { compile, regenerate: geometry, isCurrent: () => true },
    );

    expect(geometry.mock.calls[0][0].parts.map((part) => part.id)).toEqual(['deck']);
    expect(result.parts[0].dimensions.width).toBe(100);
    expect(result.parts[1]).toBe(unrelated);
    expect(result.parts[1].customNodes).toBe(unrelated.customNodes);
    expect(compile).not.toHaveBeenCalled();
  });

  it('preserves sharing across ordinary assembly duplication without rebinding to the copy identity', async () => {
    const part = deck();
    const copies = duplicateParts([part], [part]);
    const result = await prepareParameterEdit(
      { parts: [part, ...copies], parameters },
      { compile, regenerate, isCurrent: () => true },
    );

    expect(result.parts.map((item) => item.dimensions.width)).toEqual([100, 100]);
    expect(result.parts[0].id).not.toBe(result.parts[1].id);
    expect(result.parts[1].dimensionBindings).toEqual(part.dimensionBindings);
    expect(part.dimensions.width).toBe(80);
  });

  it('keeps unrelated bound parts identical on rename and freezes only exact named references on deletion', () => {
    const declarations: DesignParameter[] = [...parameters, { name: 'frozen_parameter_value', unit: 'mm', value: 7 }];
    const unrelated = {
      ...deck(),
      id: 'unrelated',
      dimensionBindings: [{ ...deck().dimensionBindings[0], expression: 'frozen_parameter_value' }],
    };
    const design = { parts: [deck(), unrelated], parameters: declarations };
    const renamed = renameParameter(design, 'width', 'chassis');

    expect(renamed.parts[1]).toBe(unrelated);

    const removed = removeParameter(renamed, 'chassis', 'freeze');

    expect(removed.parts[1]).toBe(unrelated);
    expect(removed.parts[1].dimensionBindings![0].expression).toBe('frozen_parameter_value');
    expect(removed.parts[0].dimensionBindings![0].expression).toBe('(100 mm)');
  });

  it('rejects a successful geometry completion after an ordinary undo changes the captured document', async () => {
    const original = deck();
    const changed = { ...original, note: 'Intervening edit' };
    let doc = pushHistory(docFromParts([original]), [changed], trackedOf(DEFAULT_PROJECT));
    const captured = doc;
    let finish!: (parts: ScenePart[]) => void;
    let entered!: () => void;
    let resolveGeometry: ScenePart[] = [];
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = prepareParameterEdit(
      { parts: doc.parts, parameters },
      {
        compile,
        regenerate: async (job) =>
          new Promise<ScenePart[]>((resolve) => {
            finish = resolve;
            resolveGeometry = regenerateParameterGeometry(job);
            entered();
          }),
        isCurrent: () => doc === captured,
      },
    );

    await started;
    doc = travelProject(doc, DEFAULT_PROJECT, { direction: 'undo' })!.doc;
    finish(resolveGeometry);
    await expect(pending).rejects.toThrow(/changed/);
    expect(doc.parts[0]).toBe(original);
    expect(original.dimensions.width).toBe(80);
  });
});

it('follows existing mates when a shared CAD dimension moves a declared port', async () => {
  const cad = {
    ...generatedCad([80, 6, 20]),
    code: 'width = 80;\ncube([width,20,6],center=true);',
    ports: [
      {
        name: 'edge',
        kind: 'face' as const,
        position: [40, 0, 3] as [number, number, number],
        axis: [0, 0, 1] as [number, number, number],
      },
    ],
  };
  const source = {
    ...specToPart({ id: 'source', shape: 'cad_part', cad }),
    dimensionBindings: [{ kind: 'cad' as const, target: 'width', expression: 'width', unit: 'mm' as const }],
  };
  const lid = specToPart({
    id: 'lid',
    shape: 'cad_part',
    cad: {
      ...generatedCad([20, 4, 10]),
      ports: [{ name: 'bottom', kind: 'face', position: [0, 0, -2], axis: [0, 0, -1] }],
    },
  });
  const mate = planMate([source, lid], {
    part: lid.id,
    port: 'bottom',
    target: source.id,
    targetPort: 'edge',
    type: 'face',
  });

  if (typeof mate === 'string' || mate.op.op !== 'update') throw new Error(String(mate));

  const attached = applySpec(lid, mate.op.part);
  const result = await prepareParameterEdit(
    { parts: [source, attached], parameters },
    {
      compile: async () => ({
        ok: true,
        ...generatedCad([100, 6, 20]),
        ports: [{ ...cad.ports[0], position: [50, 0, 3] }],
      }),
      regenerate,
      isCurrent: () => true,
    },
  );
  const position = (part: ScenePart, name: string) => worldPort(part, findPort(part, name)!).position;

  expect(position(result.parts[0], 'edge')).toEqual(position(result.parts[1], 'bottom'));
  expect(result.parts[1].mates).toEqual(attached.mates);
  expect(result.parts[1].position[0] - attached.position[0]).toBeCloseTo(10);
  expect(result.parts[1].cad!.positions).toEqual(attached.cad!.positions);
});

it.each([1, 32, 128])(
  'bounds repeated-module work for %s connected dimensions and retains unrelated geometry',
  async (count) => {
    const bound = Array.from({ length: count }, (_, index) => ({ ...deck(), id: `deck-${index}` }));
    const unrelated = Array.from({ length: count }, (_, index) => specToPart({ id: `stock-${index}`, shape: 'box' }));
    const input = [...bound, ...unrelated];
    const result = await prepareParameterEdit(
      { parts: input, parameters },
      { compile, regenerate, isCurrent: () => true },
    );

    expect(result.metrics.compiled).toBe(0);
    expect(result.metrics.retained).toBe(count);
    expect(result.parts.slice(count)).toEqual(unrelated);

    for (const [index, part] of unrelated.entries()) expect(result.parts[index + count]).toBe(part);

    process.stdout.write(`parameter-preparation ${JSON.stringify({ count, ...result.metrics })}\n`);
  },
);

it('cancels repeated-module preparation before unstarted kernel jobs enter the pool', async () => {
  const source = {
    ...specToPart({
      id: 'deck',
      shape: 'cad_part',
      cad: { ...generatedCad([80, 6, 20]), code: 'width = 80;\ncube([width,20,6]);' },
    }),
    dimensionBindings: [{ kind: 'cad' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
  };
  const parts = Array.from({ length: 64 }, (_, index) => ({ ...source, id: `deck-${index}` }));
  const controller = new AbortController();
  const completions: Array<() => void> = [];
  const queued = vi.fn(
    () =>
      new Promise<{ ok: true; positions: number[]; indices: number[] }>((resolve) => {
        completions.push(() => resolve({ ok: true, ...generatedCad([100, 6, 20]) }));
      }),
  );
  const pending = prepareParameterEdit(
    { parts, parameters },
    { compile: queued, regenerate, isCurrent: () => true, signal: controller.signal },
  );
  const cancelled = performance.now();

  controller.abort();
  await expect(pending).rejects.toThrow(/cancel/);
  expect(queued).toHaveBeenCalledTimes(4);

  const latencyMs = performance.now() - cancelled;
  const outstanding = queued.mock.results.map((result) => result.value);

  completions.forEach((finish) => finish());
  await Promise.all(outstanding);
  expect(queued).toHaveBeenCalledTimes(4);
  expect(parts.every((part) => part.dimensions.width === 80)).toBe(true);
  process.stdout.write(
    `parameter-cad-cancellation ${JSON.stringify({ modules: 64, dispatched: queued.mock.calls.length, latencyMs })}\n`,
  );
});

it('regenerates an editable primitive tube wall and refuses clamped wall thickness atomically', async () => {
  const tube = {
    ...specToPart({ id: 'tube', shape: 'tube', size: [20, 20, 10], thickness: 6 }),
    dimensionBindings: [{ kind: 'primitive' as const, target: 'thickness', unit: 'mm' as const, expression: 'wall' }],
  };
  const result = await prepareParameterEdit(
    { parts: [tube], parameters: [{ name: 'wall', unit: 'mm', value: 3 }] },
    { compile, regenerate, isCurrent: () => true },
  );
  const { partSoup } = await import('../sketch/fixtures/supportDesigns');
  const { measureTriangles } = await import('../../three/meshMeasure');

  expect(result.parts[0].dimensions.thickness).toBe(3);
  expect(measureTriangles(partSoup(result.parts[0])).volumeMm3).toBeCloseTo(Math.PI * (100 - 49) * 10, -1);
  await expect(
    prepareParameterEdit(
      { parts: [tube], parameters: [{ name: 'wall', unit: 'mm', value: 9 }] },
      { compile, regenerate, isCurrent: () => true },
    ),
  ).rejects.toThrow(/tube wall/);
  expect(tube.dimensions.thickness).toBe(6);
});
