import { describe, expect, it } from 'vitest';
import { regenerateSketchParts } from '../../three/sketchSupportOps';
import { applySpec } from '../../agent/agentScene';
import { evaluateBoolean } from '../../booleans/evaluate';
import { booleanPart } from '../../booleans/parts';
import { measureTriangles } from '../../three/meshMeasure';
import { supportDesign, generatedCad, mountingFeature, SUPPORT_DESIGNS } from './fixtures/supportDesigns';
import { supportWork } from './supportState';
import type { ScenePart } from '../../types/robotics';

function modifiedSource(offset: number): ScenePart {
  const { source } = supportDesign(0);
  const first = generatedCad([60, 6, 40]);
  const second = generatedCad([60, 6, 40]);
  const positions = [
    ...first.positions,
    ...second.positions.map((v, i) => v + (i % 3 === 0 ? 100 : 0) + (i % 3 === 2 ? offset : 0)),
  ];
  const indices = [...first.indices, ...second.indices.map((i) => i + first.positions.length / 3)];

  return applySpec(source, { id: source.id, cad: { ...first, positions, indices } });
}

describe('supported Sketch refusal and boolean surfaces', () => {
  it.each([
    { offset: 0, cause: 'topology' },
    { offset: 20, cause: 'ambiguous' },
  ])('refuses separated faces with offset $offset', ({ offset, cause }) => {
    const { feature } = supportDesign(0);
    const result = regenerateSketchParts([modifiedSource(offset), feature]);
    const kept = result.updated.find((p) => p.id === feature.id)!;

    expect(result.failures).toEqual([{ id: feature.id, cause }]);
    expect(kept.customNodes).toBe(feature.customNodes);
    expect(kept.sketch!.support!.issue).toBe(cause);
  });

  it('refuses malformed saved Sketch contents even when its source fingerprint matches', () => {
    const { source, feature } = supportDesign(1);
    const bad = {
      ...feature,
      sketch: {
        ...feature.sketch!,
        sketch: {
          ...feature.sketch!.sketch,
          entities: [
            ...feature.sketch!.sketch.entities,
            { id: 'bad-circle', kind: 'circle' as const, c: 'missing', r: Infinity },
          ],
        },
      },
    };
    const result = regenerateSketchParts([source, bad]);

    expect(result.failures).toEqual([{ id: bad.id, cause: 'malformed' }]);
    expect(result.prepared).toBe(0);
    expect(result.updated[0].customNodes).toBe(bad.customNodes);
  });

  it('refuses duplicate support identities without preparing either source', () => {
    const { source, feature } = supportDesign(0);
    const result = regenerateSketchParts([source, { ...source, position: [100, 0, 0] }, feature]);

    expect(result.failures).toEqual([{ id: feature.id, cause: 'malformed' }]);
    expect(result.prepared).toBe(0);
  });

  it('refuses nonfinite transforms and oversized payloads before geometry preparation', () => {
    const { source, feature } = supportDesign(0);
    const nonfinite = regenerateSketchParts([{ ...source, rotation: [0, Infinity, 0] }, feature]);
    const huge = regenerateSketchParts([
      { ...source, cad: { ...source.cad!, positions: new Array(1_000_000).fill(0) } },
      feature,
    ]);

    expect(nonfinite.failures).toEqual([{ id: feature.id, cause: 'transform' }]);
    expect(huge.failures).toEqual([{ id: feature.id, cause: 'limit' }]);
    expect(huge.prepared).toBe(0);
  });

  it('rejects a dependency deeper than sixteen levels and preserves prior solids', () => {
    const { source, feature } = supportDesign(5);
    const chain = [feature];

    for (let i = 1; i < 17; i++)
      chain.push(
        mountingFeature(
          chain[i - 1],
          { ...SUPPORT_DESIGNS[5], feature: [40, 16, 3], holes: 0, offset: false },
          `chain-${i}`,
        ),
      );

    const input = [{ ...source, position: [0, 20, 0] as [number, number, number] }, ...chain];
    const result = regenerateSketchParts(input);

    expect(result.failures).toContainEqual({ id: chain[16].id, cause: 'limit' });
    expect(result.updated.find((p) => p.id === chain[16].id)!.customNodes).toBe(chain[16].customNodes);
  });

  it('regenerates a real ordinary Subtract pocket against its original operand', async () => {
    const { source, feature } = supportDesign(0);
    const changed = { ...source, dimensions: { ...source.dimensions, width: 180, height: 10, depth: 120 } };
    const boolean = booleanPart({ id: 'deck-with-pocket', base: changed, tools: [feature], op: 'subtract' });
    const result = regenerateSketchParts(supportWork([boolean]).flat);
    const updated = result.updated.find((p) => p.id === feature.id)!;
    const built = booleanPart({ id: boolean.id, base: changed, tools: [updated], op: 'subtract' });
    const mesh = await evaluateBoolean(built);

    expect(result.failures).toEqual([]);
    expect(updated.sketch!.support!.partId).toBe(source.id);
    expect(mesh).not.toBeNull();

    const soup = new Float32Array(mesh!.indices.length * 3);

    for (let i = 0; i < mesh!.indices.length; i++)
      for (let k = 0; k < 3; k++) soup[i * 3 + k] = mesh!.positions[mesh!.indices[i] * 3 + k];

    expect(measureTriangles(soup).volumeMm3).toBeCloseTo(180 * 10 * 120 - 50 * 30 * 4, -1);
  });
});
