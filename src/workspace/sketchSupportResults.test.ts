import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { booleanPart } from '../booleans/parts';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, measureObject } from '../three/meshMeasure';
import { regenerateSketchParts } from '../three/sketchSupportOps';
import { addCircle, addRectangle } from '../utils/sketch/edit';
import { placedPlane } from '../utils/sketch/face';
import { partFromSolid, sketchSolid } from '../utils/sketch/placement';
import { captureSupport } from '../utils/sketch/support';
import { supportWork } from '../utils/sketch/supportState';
import { prepareSupportJob } from '../utils/sketch/supportJob';
import { readinessFingerprint, readinessOf } from '../readiness/readiness';
import { docFromParts, pushHistory, stepHistory, trackedOf } from './docHistory';
import { applySketchSupportResults } from './sketchSupportResults';

function fixture(depth = 5) {
  const source: ScenePart = {
    id: 'deck',
    name: 'Rover deck',
    kind: 'cube',
    category: 'primitives',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 80, height: 10, depth: 60 },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
  };
  const geometry = new THREE.BoxGeometry(80, 10, 60).toNonIndexed();
  const captured = captureSupport(source, geometry.getAttribute('position').array, { normal: [0, 1, 0] })!;

  geometry.dispose();

  const outline = addRectangle(captured.reference, {
    corner: { at: [-20, -10] },
    opposite: [20, 10],
    width: 40,
    height: 20,
  })!;
  const sketch = addCircle(outline.sketch, { at: [0, 0] }, 3, true)!.sketch;
  const solid = sketchSolid(
    placedPlane(captured.face.plane, source),
    { sketch, mode: 'extrude', depth },
    { id: 'mount-node', name: 'Mount', color: source.color },
  )!;
  const mount = partFromSolid(
    { ...source, kind: 'custom_model', id: 'mount', name: 'Mount', mechanicalTag: '3D Printed PLA/PETG', massG: 10 },
    solid,
  );

  return { source, mount: { ...mount, sketch: { ...mount.sketch!, support: captured.support } } };
}

function moved(source: ScenePart): ScenePart {
  return { ...source, position: [10, 20, 30], rotation: [0, 45, 0], dimensions: { width: 100, height: 20, depth: 80 } };
}

describe('Sketch document regeneration', () => {
  it('applies the worker payload geometry without replacing document metadata or layer state', () => {
    const { source, mount } = fixture();
    const feature = { ...mount, note: 'Keep service access', visible: false, locked: true };
    const input = [moved(source), feature];
    const job = prepareSupportJob(input)!;
    const result = regenerateSketchParts(structuredClone(job.parts), job.force);
    const current = applySketchSupportResults(docFromParts(input), input, result.updated).parts[1];

    expect(result.failures).toEqual([]);
    expect(current.position).toEqual([10, 32.5, 30]);
    expect(current).toMatchObject({ note: 'Keep service access', visible: false, locked: true });
    expect(current.mechanicalTag).toBe(feature.mechanicalTag);
    expect(current.massG).toBe(feature.massG);
  });

  it('uses real geometry preparation and produces the expected solid volume with its mounting hole', () => {
    const { source, mount } = fixture();
    const changed = moved(source);
    const result = regenerateSketchParts([changed, mount]);
    const updated = result.updated.find((p) => p.id === mount.id)!;
    const group = buildPartGroup(updated, false);
    const measured = measureObject(group);
    const triangles = localTriangles(group);

    releasePartGroup(group);

    expect(result.failures).toEqual([]);
    expect(result.prepared).toBe(1);
    expect(updated.position).toEqual([10, 32.5, 30]);
    expect(updated.rotation).toEqual([0, 45, 0]);
    expect(updated.massG).toBe(10);
    expect(updated.mechanicalTag).toBe(mount.mechanicalTag);
    expect(updated.sketch!.sketch.constraints).toEqual(mount.sketch!.sketch.constraints);
    expect(triangles.length).toBeGreaterThan(36 * 3);
    expect(measured.volumeMm3).toBeCloseTo((40 * 20 - Math.PI * 9) * 5, -1);
    expect(measured.max[1] - measured.min[1]).toBeCloseTo(5);
  });

  it('keeps the source and successful descendant update in one undo and redo step', () => {
    const { source, mount } = fixture();
    const before = docFromParts([source, mount]);
    const edited = pushHistory(before, [moved(source), mount], trackedOf(DEFAULT_PROJECT));
    const result = regenerateSketchParts(edited.parts);
    const settled = applySketchSupportResults(edited, edited.parts, result.updated);
    const undo = stepHistory(settled, { ...trackedOf(DEFAULT_PROJECT), parts: settled.parts }, 'undo')!;
    const redo = stepHistory(undo.doc, { ...trackedOf(DEFAULT_PROJECT), parts: undo.doc.parts }, 'redo')!;

    expect(settled.past).toBe(edited.past);
    expect(settled.past).toHaveLength(1);
    expect(undo.to.parts).toBe(before.parts);
    expect(redo.to.parts).toBe(settled.parts);
    expect(redo.to.parts[1].position).toEqual([10, 32.5, 30]);
  });

  it('discards a worker completion after an intervening edit or scene switch', () => {
    const { source, mount } = fixture();
    const input = [moved(source), mount];
    const result = regenerateSketchParts(input);
    const current = docFromParts([...input]);
    const otherScene = docFromParts([]);

    expect(applySketchSupportResults(current, input, result.updated)).toBe(current);
    expect(applySketchSupportResults(otherScene, input, result.updated)).toBe(otherScene);
  });

  it('updates a cutout inside ordinary Subtract through its source operand identity', () => {
    const { source, mount } = fixture(-5);
    const cut = booleanPart({ id: 'subtract', base: source, tools: [mount], op: 'subtract' });
    const editedSource = moved(cut.boolean.operands[0]);
    const edited = { ...cut, boolean: { ...cut.boolean, operands: [editedSource, cut.boolean.operands[1]] } };
    const doc = docFromParts([edited]);
    const work = supportWork(doc.parts);
    const result = regenerateSketchParts(work.flat);
    const settled = applySketchSupportResults(doc, doc.parts, result.updated);
    const operands = settled.parts[0].boolean!.operands;

    expect(result.failures).toEqual([]);
    expect(operands[1].position).toEqual([10, 27.5, 30]);
    expect(operands[1].sketch!.support!.partId).toBe(source.id);
    expect(operands[1].sketch!.support!.partId).not.toBe(cut.id);
    expect(settled.parts[0].boolean!.op).toBe('subtract');
  });

  it('blocks retained stale geometry in Checks and changes its freshness inputs', () => {
    const { source, mount } = fixture();
    const parts = [moved(source), mount];
    const stale = readinessOf([], { parts, fingerprint: 'before' });
    const result = regenerateSketchParts(parts);
    const current = applySketchSupportResults(docFromParts(parts), parts, result.updated).parts;
    const fresh = readinessOf(stale.findings, { parts: current, fingerprint: 'after' });

    expect(stale.blockers.map((f) => f.rule)).toEqual(['sketch-support']);
    expect(fresh.blockers).toEqual([]);
    expect(readinessFingerprint(current, null)).not.toBe(readinessFingerprint(parts, null));
  });
});
