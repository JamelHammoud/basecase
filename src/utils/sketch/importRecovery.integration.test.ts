import { BoxGeometry, BufferAttribute, BufferGeometry, Matrix4, ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { sheetPart, plateTriangles, pocketTriangles } from '../../sheet/sheet.fixtures';
import { detectSheet } from '../../sheet/detectSheet';
import { buildPartGroup, releasePartGroup } from '../../three/buildPartMesh';
import { measureTriangles, worldTriangles } from '../../three/meshMeasure';
import { RECOVERY_DESIGNS, recoveryImportedPart, stepDerivedPart, recoveryTriangles } from './importRecovery.fixtures';
import { rebuiltPart } from '../../workspace/useSketchSession';
import { decodeSceneFile, encodeSceneFile } from '../sceneFile';
import { recoverImportedSketch } from './importRecovery';
import { compareRecovery } from './recoveryComparison';
import type { ScenePart } from '../../types/robotics';

function triangles(part: ScenePart) {
  const group = buildPartGroup(part, false, { lateEdges: false });

  try {
    return worldTriangles(group);
  } finally {
    releasePartGroup(group);
  }
}

describe('imported flat solids through production Sketch regeneration', () => {
  it.each(RECOVERY_DESIGNS.map((design, index) => ({ ...design, index })))(
    'recovers $name, edits thickness and reopens retained source geometry',
    async ({ index, holes }) => {
      const source = await recoveryImportedPart(index);
      const before = structuredClone(source);
      const original = triangles(source);
      const result = recoverImportedSketch(source);
      const converted = result.part;

      expect(converted.id).toBe(source.id);
      expect(converted.position).toEqual(source.position);
      expect(converted).toMatchObject({
        name: source.name,
        color: source.color,
        group: source.group,
        role: source.role,
        printMaterial: 'PETG',
      });
      expect(converted.mesh).toEqual(source.mesh);
      expect(source).toEqual(before);
      expect(compareRecovery(original, triangles(converted)).deviationMm).toBeLessThan(0.005);
      expect(converted.sketch!.sketch.constraints).toEqual([]);

      const edited = rebuiltPart(converted, { depth: result.part.sketch!.depth * 1.7 });
      const profile = detectSheet(triangles(edited));

      expect(profile?.thicknessMm).toBeCloseTo(converted.sketch!.depth * 1.7, 3);
      expect(profile?.holes.length).toBe(holes.length);
      expect(measureTriangles(triangles(edited)).volumeMm3 / measureTriangles(original).volumeMm3).toBeCloseTo(1.7, 3);

      const reopened = await decodeSceneFile(
        await encodeSceneFile({ name: 'Robot', globalGoal: '', annotations: [], parts: [edited] }),
      );

      expect(JSON.stringify(reopened.parts[0].mesh)).toBe(JSON.stringify(source.mesh));
      expect(reopened.parts[0].sketch).toEqual(edited.sketch);
      expect(rebuiltPart(reopened.parts[0], { depth: 4 }).sketch!.depth).toBe(4);
    },
  );

  it('refuses malformed triangles, open meshes, pockets, disconnected solids and exact products', () => {
    const soup = plateTriangles();
    const second = new BufferGeometry().setAttribute('position', new BufferAttribute(soup.slice(), 3));

    second.applyMatrix4(new Matrix4().makeTranslation(200, 0, 0));

    const disconnected = Float32Array.from([...soup, ...second.getAttribute('position').array]);
    const degenerate = Float32Array.from([...soup, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    for (const invalid of [pocketTriangles(), soup.slice(9), disconnected, degenerate]) {
      expect(() => recoverImportedSketch(stepDerivedPart(invalid))).toThrow();
    }

    expect(() => recoverImportedSketch({ ...stepDerivedPart(soup), componentId: 'exact-product' })).toThrow();
    expect(() =>
      recoverImportedSketch({ ...stepDerivedPart(soup), sheet: { material: 'aluminum-6061', thicknessMm: 3 } }),
    ).toThrow();
    expect(() => recoverImportedSketch(sheetPart())).toThrow();

    const source = stepDerivedPart(soup);
    const malformed = { ...source, mesh: { ...source.mesh!, positions: [NaN, ...source.mesh!.positions.slice(1)] } };
    const oversized = { ...source, mesh: { ...source.mesh!, indices: Array.from({ length: 60003 }, () => 0) } };
    const cube = new BoxGeometry(10, 10, 10).toNonIndexed();

    expect(() => recoverImportedSketch({ ...source, mesh: { ...source.mesh!, file: undefined } })).toThrow();
    expect(() => recoverImportedSketch(malformed)).toThrow();
    expect(() => recoverImportedSketch(oversized)).toThrow();
    expect(() => recoverImportedSketch(stepDerivedPart(cube.getAttribute('position').array as Float32Array))).toThrow();
    expect(() => recoverImportedSketch({ ...source, massG: 20 })).toThrow();
    expect(() => recoverImportedSketch({ ...source, mechanicalTag: 'CNC Aluminum' })).toThrow();
    cube.dispose();
    second.dispose();
  });

  it('independently rejects different surfaces with matching bounds', () => {
    const original = new BoxGeometry(80, 60, 3).toNonIndexed();

    expect(() => compareRecovery(original.getAttribute('position').array as Float32Array, plateTriangles())).toThrow();
    original.dispose();
  });
  it('refuses a moved hole with unchanged bounds, volume and hole count', () => {
    const design = RECOVERY_DESIGNS[0];
    const shape = new Shape(design.outer.map(([x, y]) => new Vector2(x, y)));

    shape.holes = design.holes.map((loop, i) => new Path(loop.map(([x, y]) => new Vector2(x + (i === 0 ? 4 : 0), y))));

    const changed = new ExtrudeGeometry(shape, { depth: design.depth, bevelEnabled: false, steps: 1 });
    const moved = changed.getAttribute('position').array as Float32Array;
    const original = recoveryTriangles(0);
    const before = measureTriangles(original);
    const after = measureTriangles(moved);

    expect(before.min).toEqual(after.min);
    expect(before.max).toEqual(after.max);
    expect(before.volumeMm3).toBeCloseTo(after.volumeMm3, 2);
    expect(() => compareRecovery(original, moved)).toThrow();
    changed.dispose();
  });
});
