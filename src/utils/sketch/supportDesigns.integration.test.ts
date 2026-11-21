import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyAgentOps } from '../../workspace/applyAgentOps';
import { editWithOperands } from '../../booleans/operands';
import { liveEdit, pushHistory, trackedOf } from '../../workspace/docHistory';
import { supportWork } from './supportState';
import { withTunedPart } from '../../agent/cadTune';
import { buildPartGroup, releasePartGroup } from '../../three/buildPartMesh';
import { measureObject, type MeshMeasure } from '../../three/meshMeasure';
import { regenerateSketchParts } from '../../three/sketchSupportOps';
import { DEFAULT_PROJECT, type ScenePart } from '../../types/robotics';
import { buildBom } from '../bom';
import { sceneJson } from '../sceneJson';
import { decodeSceneFile, encodeSceneFile } from '../sceneFile';
import { readinessFingerprint, readinessOf } from '../../readiness/readiness';
import { applySketchSupportResults } from '../../workspace/sketchSupportResults';
import { docFromParts } from '../../workspace/docHistory';
import { duplicateParts } from '../../workspace/useSelectionOps';
import { copyToClipboard, takePaste } from '../../workspace/partsClipboard';
import { SUPPORT_DESIGNS, generatedCad, mountingFeature, supportDesign } from './fixtures/supportDesigns';
import { partPlane } from './placement';
import { toPartLocal } from './face';
import { mirrorPart } from '../../mirror/mirrorPart';

function measure(part: ScenePart) {
  const group = buildPartGroup(part, false);

  try {
    return measureObject(group);
  } finally {
    releasePartGroup(group);
  }
}

function settled(parts: ScenePart[]) {
  const result = regenerateSketchParts(parts);

  expect(result.failures).toEqual([]);

  return applySketchSupportResults(docFromParts(parts), parts, result.updated).parts;
}

function stock(parts: ScenePart[], measures: Record<string, MeshMeasure>) {
  return buildBom({ parts, project: DEFAULT_PROJECT, purchases: {}, measures })
    .lines.filter((line) => line.category === 'Components' || line.category === 'Hardware')
    .map(({ key, qty, partIds }) => ({ key, qty, partIds }));
}

function assertGeometry(feature: ScenePart, source: ScenePart, index: number) {
  const design = SUPPORT_DESIGNS[index];
  const plane = partPlane(feature);
  const local = toPartLocal(plane.origin, source);
  const actual = measure(feature);
  const [width, depth, height] = design.feature;
  const outerArea = design.round ? 32 * (width / 2) ** 2 * Math.sin(Math.PI / 32) : width * depth;
  const expectedVolume = (outerArea - design.holes * Math.PI * 4) * Math.abs(height);
  const group = buildPartGroup(feature, false);
  const ray = new THREE.Raycaster();
  const normal = new THREE.Vector3(...plane.n);

  group.updateMatrixWorld(true);

  for (const circle of feature.sketch!.sketch.entities) {
    if (circle.kind !== 'circle' || circle.r !== 2) continue;

    const center = feature.sketch!.sketch.points.find((p) => p.id === circle.c)!;
    const point = new THREE.Vector3(...plane.origin)
      .addScaledVector(new THREE.Vector3(...plane.u), center.x)
      .addScaledVector(new THREE.Vector3(...plane.v), center.y)
      .addScaledVector(normal, 100);

    ray.set(point, normal.clone().negate());
    expect(ray.intersectObject(group, true).filter((hit) => (hit.object as THREE.Mesh).isMesh)).toEqual([]);
  }

  releasePartGroup(group);
  expect(local[0]).toBeCloseTo(0, 4);
  expect(local[1]).toBeCloseTo(source.dimensions.height / 2, 4);
  expect(local[2]).toBeCloseTo(0, 4);
  expect(actual.volumeMm3).toBeCloseTo(expectedVolume, -1);
  expect(feature.dimensions).toMatchObject({ width, depth, height: Math.abs(height) });

  const corner = feature.sketch!.sketch.points.find((p) => !p.fixed)!;
  const expectedX = design.offset ? -source.dimensions.width / 2 + 8 : -width / 2;
  const expectedY = design.offset ? -source.dimensions.depth / 2 + 8 : -depth / 2;

  expect(corner.x).toBeCloseTo(expectedX + (design.round ? width / 2 : 0), 5);
  expect(corner.y).toBeCloseTo(expectedY + (design.round ? depth / 2 : 0), 5);
}

describe('generated Design to Engineer Sketch handoff', () => {
  it.each(SUPPORT_DESIGNS.map((design, index) => ({ ...design, index })))(
    '$name preserves surfaces, holes, intent and purchasing identities',
    ({ index }) => {
      const fixture = supportDesign(index);
      const beforeMeasure = measure(fixture.feature);
      const size = fixture.source.dimensions;
      const edited = fixture.parts.map((p) =>
        p.id === fixture.source.id
          ? {
              ...p,
              position: [17, 23, -11] as [number, number, number],
              rotation: [15, 35, -10] as [number, number, number],
              dimensions: { width: size.width + 20, height: size.height + 4, depth: size.depth + 16 },
            }
          : p,
      );
      const after = settled(edited);
      const feature = after.find((p) => p.id === fixture.feature.id)!;

      assertGeometry(feature, after[0], index);
      expect(feature.sketch!.support!.partId).toBe(fixture.source.id);
      expect(feature.sketch!.sketch.constraints).toEqual(fixture.feature.sketch!.sketch.constraints);
      expect(feature).toMatchObject({
        id: fixture.feature.id,
        massG: 12,
        print: { copies: 2 },
        note: 'Keep service access',
      });
      expect(stock(after, { feature: measure(feature) })).toEqual(stock(fixture.parts, { feature: beforeMeasure }));
      expect(after[2]).toBe(fixture.parts[2]);
      expect(after[3]).toBe(fixture.parts[3]);
      expect(readinessOf([], { parts: after, fingerprint: '' }).blockers).toEqual([]);
      expect(readinessFingerprint(after, null)).not.toBe(readinessFingerprint(edited, null));
    },
  );

  it('uses agent CAD replacement and retriangulation without rebuilding unrelated parts', () => {
    const { parts, source } = supportDesign(1);
    const cad = generatedCad([90, 28, 90], 3);
    const replaced = withTunedPart(parts, source.id, cad);
    const result = regenerateSketchParts(replaced);
    const after = applySketchSupportResults(docFromParts(replaced), replaced, result.updated).parts;

    expect(result.prepared).toBe(1);
    expect(result.failures).toEqual([]);
    expect(after[1].sketch!.support!.partId).toBe(source.id);
    expect(partPlane(after[1]).origin[1]).toBeCloseTo(after[0].position[1] + 14);
    expect(after[2]).toBe(parts[2]);
  });

  it('regenerates a chain in source order and round-trips the actual scene file and serializer', async () => {
    const { parts, source, feature } = supportDesign(5);
    const second = mountingFeature(
      feature,
      { ...SUPPORT_DESIGNS[5], feature: [20, 8, 2], holes: 0, offset: false },
      'second',
    );
    const edited = [
      { ...source, position: [10, 30, 20] as [number, number, number] },
      feature,
      second,
      ...parts.slice(2),
    ];
    const after = settled(edited);
    const serialized = JSON.parse(await sceneJson({ parts: after, project: DEFAULT_PROJECT }));
    const file = await encodeSceneFile({
      name: 'Gripper',
      globalGoal: '',
      parts: after,
      annotations: [],
      project: DEFAULT_PROJECT,
    });
    const reopened = await decodeSceneFile(file);

    expect(reopened.parts).toEqual(serialized.parts);
    expect(partPlane(after[2]).origin[1]).toBeCloseTo(30 + source.dimensions.height / 2 + 3);
    expect(regenerateSketchParts(reopened.parts).updated).toEqual([]);
  });

  it('uses ordinary agent replacement commits and keeps one complete undoable edit', async () => {
    const { parts, source } = supportDesign(1);
    let doc = docFromParts(parts);

    await applyAgentOps([{ op: 'update', part: { id: source.id, cad: generatedCad([90, 28, 90]) } }], {
      current: () => doc.parts,
      commitParts: (updater, live) => {
        const after = editWithOperands(doc.parts, updater);

        doc = live ? liveEdit(doc, after) : pushHistory(doc, after, trackedOf(DEFAULT_PROJECT));

        const input = doc.parts;
        const result = regenerateSketchParts(supportWork(input).flat);

        doc = applySketchSupportResults(doc, input, result.updated);
      },
      viewport: () => null,
      setCursor: () => {},
      setAction: () => {},
      isFollowing: () => false,
      guard: () => null,
      touch: () => {},
    });

    expect(doc.past).toHaveLength(1);
    expect(doc.past[0].parts).toBe(parts);
    expect(partPlane(doc.parts[1]).origin[1]).toBeCloseTo(doc.parts[0].position[1] + 14);
    expect(doc.parts[2]).toBe(parts[2]);
  });

  it('remaps a copied assembly and makes a feature copied alone independent', () => {
    const { parts, source, feature } = supportDesign(5);
    const copies = duplicateParts([source, feature], parts);
    const current = settled(copies);

    expect(current[1].sketch!.support!.partId).toBe(current[0].id);
    expect(current[0].id).not.toBe(source.id);
    expect(duplicateParts([feature], parts)[0].sketch!.support).toBeUndefined();
    copyToClipboard([source, feature], 'source-scene', false);

    const pasted = takePaste('other-scene')!;

    expect(pasted[1].sketch!.support!.partId).toBe(pasted[0].id);
    expect(pasted[0].id).not.toBe(source.id);
  });

  it('keeps a mirrored feature independent instead of regenerating it onto the original support', () => {
    const { source, feature } = supportDesign(5);
    const mirrored = { ...mirrorPart(feature, { axis: 0, offset: 60 }), id: 'mirrored-feature' };
    const after = settled([{ ...source, position: [20, 30, 40] }, feature, mirrored]);

    expect(mirrored.sketch!.support).toBeUndefined();
    expect(after[2]).toBe(mirrored);
    expect(after[2].position).toEqual([120 - feature.position[0], feature.position[1], feature.position[2]]);
    expect(after[2].customNodes).toBe(mirrored.customNodes);
  });
});

it('reopens legacy unbound sketches without creating a dependency or rebuilding geometry', async () => {
  const { source, feature } = supportDesign(0);
  const legacy = { ...feature, sketch: { ...feature.sketch!, support: undefined } };
  const file = await encodeSceneFile({
    name: 'Legacy deck',
    globalGoal: '',
    parts: [source, legacy],
    annotations: [],
    project: DEFAULT_PROJECT,
  });
  const reopened = await decodeSceneFile(file);
  const result = regenerateSketchParts(reopened.parts);

  expect(reopened.parts[1].sketch!.support).toBeUndefined();
  expect(reopened.parts[1].customNodes).toEqual(feature.customNodes);
  expect(result).toMatchObject({ updated: [], failures: [], prepared: 0, geometryBytes: 0 });
});
