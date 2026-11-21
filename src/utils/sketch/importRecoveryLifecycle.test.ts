import { BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Ray, Vector3 } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { describe, expect, it } from 'vitest';
import { MeshBVH } from 'three-mesh-bvh';
import { buildPartGroup, releasePartGroup } from '../../three/buildPartMesh';
import { worldTriangles, measureTriangles } from '../../three/meshMeasure';
import { sceneStl } from '../../three/analysis/sceneStl';
import { ShapeSolid } from '../../three/analysis/shapeSolid';
import { DEFAULT_PROJECT, type ScenePart } from '../../types/robotics';
import { captureVersion, emptyVersionGraph, readVersionGraph, restoreVersion } from '../../workspace/sceneVersions';
import { docFromParts, pushHistory, stepHistory, trackedOf } from '../../workspace/docHistory';
import { rebuiltPart } from '../../workspace/useSketchSession';
import { shapeKey } from '../../print/shapeKey';
import { isPrinted } from '../bom';
import { partBounds } from '../selection';
import { partsBox } from '../../workspace/libraryModels';
import { dropToFloor } from '../../workspace/partTransforms';
import { prepareParameterEdit } from '../designParameters/transaction';
import { regenerateParameterGeometry } from '../designParameters/geometry';
import { parameterTargets } from '../designParameters/targets';
import { withConstraints } from './edit';
import { RECOVERY_DESIGNS, recoveryImportedPart } from './importRecovery.fixtures';
import { recoverImportedSketch } from './importRecovery';
import { compareRecovery } from './recoveryComparison';
import { conformRecoveryTriangles } from './recoveryConform';
import { detectSheet } from '../../sheet/detectSheet';

function soupOf(part: ScenePart) {
  const group = buildPartGroup(part, false, { lateEdges: false });

  try {
    return worldTriangles(group);
  } finally {
    releasePartGroup(group);
  }
}

function assertExportHoles(part: ScenePart) {
  const solid = new ShapeSolid(soupOf(part));
  const bytes = sceneStl([{ key: part.id, matrix: new Matrix4().toArray() }], () => solid);
  const geometry = new STLLoader().parse(Uint8Array.from(bytes).buffer);
  const soup = geometry.getAttribute('position').array as Float32Array;
  const profile = detectSheet(conformRecoveryTriangles(soup))!;
  const tree = new MeshBVH(new BufferGeometry().setAttribute('position', new BufferAttribute(soup.slice(), 3)));
  const n = new Vector3(...profile.normal);
  const u = (Math.abs(n.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0))
    .addScaledVector(n, -(Math.abs(n.x) < 0.9 ? n.x : n.y))
    .normalize();
  const v = new Vector3().crossVectors(n, u);

  for (const hole of profile.holes) {
    const center = hole.reduce(([x, y], p) => [x + p[0] / hole.length, y + p[1] / hole.length], [0, 0]);
    const origin = new Vector3(...profile.center!)
      .addScaledVector(u, center[0])
      .addScaledVector(v, center[1])
      .addScaledVector(n, profile.thicknessMm + 10);

    expect(tree.raycastFirst(new Ray(origin, n.clone().negate()), DoubleSide)).toBeNull();
  }

  expect(profile.thicknessMm).toBeCloseTo(Math.abs(part.sketch!.depth), 3);
  tree.geometry.dispose();
  geometry.dispose();
  solid.dispose();

  return profile.holes.length;
}

describe('recovered Sketch identity, history, manufacturing and parameters', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])(
    'exports actual holes after conversion and depth editing for design %s',
    async (index) => {
      const source = await recoveryImportedPart(index);
      const converted = recoverImportedSketch(source).part;
      const edited = rebuiltPart(converted, { depth: converted.sketch!.depth * 1.4 });

      expect(isPrinted(converted)).toBe(isPrinted(source));
      expect(assertExportHoles(converted)).toBe(RECOVERY_DESIGNS[index].holes.length);
      expect(assertExportHoles(edited)).toBe(RECOVERY_DESIGNS[index].holes.length);
      expect(shapeKey(edited)).not.toBe(shapeKey(converted));
    },
  );

  it('keeps one part through undo, redo and serialized native versions, including the original mesh', async () => {
    const source = await recoveryImportedPart(0);
    const converted = recoverImportedSketch(source).part;
    const doc = pushHistory(docFromParts([source]), [converted], trackedOf(DEFAULT_PROJECT));
    const undo = stepHistory(doc, { ...trackedOf(DEFAULT_PROJECT), parts: doc.parts }, 'undo')!;
    const redo = stepHistory(undo.doc, { ...trackedOf(DEFAULT_PROJECT), parts: undo.doc.parts }, 'redo')!;
    const scene = (parts: ScenePart[]) => ({ parts, project: DEFAULT_PROJECT, annotations: [], globalGoal: '' });
    const baseline = captureVersion(emptyVersionGraph(), scene([source]), {
      label: 'Imported plate',
      at: '2026-11-20T00:00:00Z',
    });
    const saved = captureVersion(baseline, scene([converted]), { label: 'Sketch plate', at: '2026-11-20T00:01:00Z' });
    const reopened = readVersionGraph(JSON.stringify(saved));

    expect(undo.doc.parts).toEqual([source]);
    expect(redo.doc.parts).toEqual([converted]);
    expect(restoreVersion(reopened, baseline.head!).parts).toEqual([source]);
    expect(restoreVersion(reopened).parts).toEqual([converted]);
  });

  it('uses authored Sketch constraints through existing parameter bindings without inferred constraints', async () => {
    const converted = recoverImportedSketch(await recoveryImportedPart(0)).part;
    const sketch = converted.sketch!.sketch;
    const line = sketch.entities.find((e) => e.kind === 'line')!;
    const a = sketch.points.find((p) => p.id === line.a)!;
    const b = sketch.points.find((p) => p.id === line.b)!;
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    const authored = withConstraints(sketch, [{ kind: 'length', line: line.id, value: length }]);
    const target = authored.constraints[0].id;
    const part = {
      ...converted,
      sketch: { ...converted.sketch!, sketch: authored },
      dimensionBindings: [{ kind: 'sketch' as const, target, expression: 'span', unit: 'mm' as const }],
    };

    expect(parameterTargets(converted)).toEqual([]);
    expect(parameterTargets(part).some((row) => row.target === target)).toBe(true);

    const result = await prepareParameterEdit(
      { parts: [part], parameters: [{ name: 'span', unit: 'mm', value: length + 2 }] },
      {
        compile: async () => {
          throw new Error('No CAD compile');
        },
        regenerate: regenerateParameterGeometry,
        isCurrent: () => true,
      },
    );

    expect(result.parts[0].id).toBe(converted.id);
    expect(result.parts[0].sketch!.sketch.constraints[0]).toMatchObject({ value: length + 2 });
    expect(assertExportHoles(result.parts[0])).toBe(4);
    expect(result.parts[0].mesh).toBe(converted.mesh);
  });

  it('bakes supported uniform, axis scaling and planar affine transforms while preserving the world origin', async () => {
    const source = await recoveryImportedPart(1);
    const scaled = {
      ...source,
      dimensions: {
        width: source.dimensions.width * 1.5,
        height: source.dimensions.height * 0.5,
        depth: source.dimensions.depth * 2,
      },
    };
    const affine = {
      ...source,
      sheetTransform: new Matrix4()
        .makeRotationX(0.37)
        .multiply(new Matrix4().set(1, 0.2, 0, 7, 0, 1, 0, 9, 0, 0, 1, 0, 0, 0, 0, 1))
        .toArray(),
    };

    for (const input of [scaled, affine]) {
      const result = recoverImportedSketch(input).part;

      expect(result.position).toEqual(input.position);
      expect(compareRecovery(soupOf(input), soupOf(result)).deviationMm).toBeLessThan(0.005);
    }
  });
  it('uses recovered contour offsets for ordinary selection, Library bounds and floor placement', async () => {
    const converted = recoverImportedSketch(await recoveryImportedPart(0)).part;
    const edited = rebuiltPart(converted, { depth: 9 });
    const measured = measureTriangles(soupOf(edited));
    const bounds = partBounds(edited);

    for (const axis of [0, 1, 2]) {
      expect(bounds.min[axis]).toBeCloseTo(measured.min[axis], 4);
      expect(bounds.max[axis]).toBeCloseTo(measured.max[axis], 4);
    }

    expect(partsBox([edited])).toEqual(bounds);

    const placed = dropToFloor([edited], new Set([edited.id]))[0];

    expect(Math.abs(measureTriangles(soupOf(placed)).min[1])).toBeLessThanOrEqual(0.0051);
  });
});
