import { describe, expect, it, vi } from 'vitest';
import { specToPart } from '../../agent/agentScene';
import { DEFAULT_PROJECT, type ScenePart } from '../../types/robotics';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../../workspace/docHistory';
import { decodeSceneFile, encodeSceneFile } from '../sceneFile';
import { sceneJson } from '../sceneJson';
import { buildBom } from '../bom';
import { readinessFingerprint } from '../../readiness/readiness';
import { fallsKey, walkKey } from '../../workspace/storedWalk';
import { partSoup, generatedCad, SUPPORT_DESIGNS, supportDesign } from '../sketch/fixtures/supportDesigns';
import { measureTriangles } from '../../three/meshMeasure';
import { prepareParameterEdit } from './transaction';
import { regenerateParameterGeometry } from './geometry';
import type { DesignParameter } from './types';

const parameters: DesignParameter[] = [
  { name: 'width', unit: 'mm', value: 180 },
  { name: 'hole', unit: 'mm', value: 2.5 },
];

function fixture(index: number) {
  const design = supportDesign(index);
  const source = {
    ...design.source,
    cad: {
      ...design.source.cad!,
      code: `width = ${design.design.size[0]};\ncube([width,${design.design.size[2]},${design.design.size[1]}], center=true);`,
    },
    dimensionBindings: [{ kind: 'cad' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
  };
  const primitive = {
    ...specToPart({ id: 'companion', shape: 'box', size: [design.design.size[0] - 16, 20, 4] }),
    dimensionBindings: [
      { kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: 'width - 16 mm' },
    ],
  };
  const parts = [source, design.feature, primitive, ...design.parts.slice(2)];

  return { ...design, source, parts };
}

function compiler(size: readonly number[]) {
  return vi.fn(async (_part: ScenePart, code: string) => {
    const width = Number(/width = ([\d.]+)/.exec(code)![1]);
    const cad = generatedCad([width, size[1], size[2]]);

    return { ok: true, positions: cad.positions, indices: cad.indices };
  });
}

describe('shared parameter production geometry transactions', () => {
  it.each(SUPPORT_DESIGNS.map((design, index) => ({ ...design, index })))(
    '$name regenerates coordinated geometry and supported references while retaining catalog identities',
    async ({ index, size }) => {
      const { parts } = fixture(index);
      const compile = compiler(size);
      const width = size[0] + 20;
      const declarations: DesignParameter[] = [{ name: 'width', unit: 'mm', value: width }];
      const before = parts.map((part) => part.dimensions);
      const prepared = await prepareParameterEdit(
        { parts, parameters: declarations },
        {
          compile,
          regenerate: async (job) => regenerateParameterGeometry(job),
          isCurrent: () => true,
        },
      );

      expect(compile).toHaveBeenCalledTimes(1);
      expect(prepared.parts[0].cad!.code).toContain(`width = ${width};`);
      expect(prepared.parts[1].sketch!.support!.partId).toBe(parts[0].id);
      expect(prepared.parts[1].sketch!.support!.issue).toBeUndefined();
      expect(prepared.parts[2].dimensions.width).toBe(width - 16);
      expect(parts.map((part) => part.dimensions)).toEqual(before);

      for (const [partIndex, part] of prepared.parts.entries()) {
        if (partIndex > 2) expect(part).toBe(parts[partIndex]);
      }

      const soup = partSoup(prepared.parts[0]);
      const xs = Array.from(soup).filter((_, i) => i % 3 === 0);

      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(width, 4);
      expect(measureTriangles(soup).volumeMm3).toBeCloseTo(width * size[1] * size[2], -1);

      const stock = (input: ScenePart[]) =>
        buildBom({ parts: input, project: DEFAULT_PROJECT, purchases: {}, measures: {} })
          .lines.filter((line) => line.category === 'Components' || line.category === 'Hardware')
          .map(({ key, qty, partIds }) => ({ key, qty, partIds }));

      expect(stock(prepared.parts)).toEqual(stock(parts));
      expect(readinessFingerprint(prepared.parts, null)).not.toBe(readinessFingerprint(parts, null));
      expect(walkKey(prepared.parts, DEFAULT_PROJECT)).not.toBe(walkKey(parts, DEFAULT_PROJECT));
      expect(fallsKey(prepared.parts, DEFAULT_PROJECT)).not.toBe(fallsKey(parts, DEFAULT_PROJECT));
      expect(prepared.metrics.compiled).toBe(1);
      expect(prepared.metrics.retained).toBe(parts.length - 3);
    },
  );
});

describe('Sketch binding and native history', () => {
  it('changes dimensional Sketch constraints in one solve and refuses conflicting constraints atomically', async () => {
    const { parts } = fixture(1);
    const feature = parts[1];
    const radius = feature.sketch!.sketch.constraints.find((constraint) => constraint.kind === 'radius')!;
    const bound = {
      ...feature,
      dimensionBindings: [{ kind: 'sketch' as const, target: radius.id, expression: 'hole', unit: 'mm' as const }],
    };
    const design = { parts: [parts[0], bound], parameters };
    const services = {
      compile: compiler([70, 20, 70]),
      regenerate: async (job: Parameters<typeof regenerateParameterGeometry>[0]) => regenerateParameterGeometry(job),
      isCurrent: () => true,
    };
    const result = await prepareParameterEdit(design, services);

    expect(result.parts[1].sketch!.sketch.constraints.find((constraint) => constraint.id === radius.id)).toMatchObject({
      value: 2.5,
    });
    expect(
      result.parts[1].sketch!.sketch.entities.filter((entity) => entity.kind === 'circle').map((entity) => entity.r),
    ).toContain(2.5);

    const conflicting = {
      ...bound,
      sketch: {
        ...bound.sketch!,
        sketch: {
          ...bound.sketch!.sketch,
          constraints: [...bound.sketch!.sketch.constraints, { ...radius, id: 'conflict', value: 4 }],
        },
      },
    };

    await expect(prepareParameterEdit({ ...design, parts: [parts[0], conflicting] }, services)).rejects.toThrow(
      /feature/,
    );
    expect(feature.sketch!.sketch.constraints).toContainEqual(radius);
  });

  it('keeps geometry and declarations together through ordinary undo, redo and native serialization', async () => {
    const { parts } = fixture(0);
    const result = await prepareParameterEdit(
      { parts, parameters },
      {
        compile: compiler([160, 6, 100]),
        regenerate: async (job) => regenerateParameterGeometry(job),
        isCurrent: () => true,
      },
    );
    const before = { ...DEFAULT_PROJECT, designParameters: [{ name: 'width', unit: 'mm' as const, value: 160 }] };
    const project = { ...before, designParameters: parameters };
    const doc = pushHistory(docFromParts(parts), result.parts, { ...trackedOf(before), project: before });
    const undone = travelProject(doc, project, { direction: 'undo' })!;
    const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;

    expect(undone.doc.parts).toBe(parts);
    expect(undone.project.designParameters).toBe(before.designParameters);
    expect(redone.doc.parts).toBe(result.parts);
    expect(redone.project.designParameters).toBe(parameters);

    const json = JSON.parse(await sceneJson({ parts: result.parts, project }));
    const reopened = await decodeSceneFile(
      await encodeSceneFile({ name: 'Rover', globalGoal: '', parts: result.parts, project, annotations: [] }),
    );

    expect(reopened.parts).toEqual(json.parts);
    expect(reopened.project!.designParameters).toEqual(parameters);

    const compile = compiler([160, 6, 100]);

    await prepareParameterEdit(
      { parts: reopened.parts, parameters },
      { compile, regenerate: async (job) => regenerateParameterGeometry(job), isCurrent: () => true },
    );
    expect(compile).not.toHaveBeenCalled();
  });
});

describe('failed or interrupted dimension preparation', () => {
  it.each([
    { ok: false, error: 'Compilation refused' },
    { ok: true, positions: [], indices: [] },
    {
      ok: true,
      ...generatedCad([180, 6, 100]),
      audit: {
        bodies: 2,
        genus: 0,
        nonManifoldEdges: 0,
        openEdges: 0,
        hullVolume: 1,
        checks: [{ name: 'bodies', want: '1', got: '2', pass: false }],
      },
    },
  ])('preserves the complete source on compilation or expectation refusal', async (rendered) => {
    const { parts } = fixture(0);
    const saved = JSON.stringify(parts);
    const regenerate = vi.fn();

    await expect(
      prepareParameterEdit({ parts, parameters }, { compile: async () => rendered, regenerate, isCurrent: () => true }),
    ).rejects.toThrow(/source/);
    expect(regenerate).not.toHaveBeenCalled();
    expect(JSON.stringify(parts)).toBe(saved);
  });

  it('rejects stale completions and interrupts without waiting for compilation to finish', async () => {
    const { parts } = fixture(0);
    let complete!: (value: { ok: false; error: string }) => void;
    const compile = () =>
      new Promise<{ ok: false; error: string }>((resolve) => {
        complete = resolve;
      });
    const regenerate = vi.fn();
    const controller = new AbortController();
    const pending = prepareParameterEdit(
      { parts, parameters },
      { compile, regenerate, isCurrent: () => true, signal: controller.signal },
    );

    const cancelledAt = performance.now();

    controller.abort();
    await expect(pending).rejects.toThrow(/cancel/i);
    process.stdout.write(`parameter-cancellation ${JSON.stringify({ latencyMs: performance.now() - cancelledAt })}\n`);
    complete({ ok: false, error: 'late' });
    expect(regenerate).not.toHaveBeenCalled();

    let current = true;
    const stale = prepareParameterEdit({ parts, parameters }, { compile, regenerate, isCurrent: () => current });

    current = false;
    complete({ ok: false, error: 'obsolete' });
    await expect(stale).rejects.toThrow(/changed/i);
    expect(regenerate).not.toHaveBeenCalled();
  });
});
