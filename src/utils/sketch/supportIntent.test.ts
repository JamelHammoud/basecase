import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { addLine, addRectangle, withConstraints } from './edit';
import { captureSupport } from './support';
import { regenerateSketches } from './supportRegeneration';
import { partFromSolid, sketchSolid } from './placement';
import { placedPlane } from './face';

const source: ScenePart = {
  id: 'deck',
  name: 'Deck',
  kind: 'cube',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 80, height: 10, depth: 60 },
  color: '#888888',
  visible: true,
  locked: false,
  note: '',
};

function soup(part: ScenePart) {
  const { width, height, depth } = part.dimensions;
  const geometry = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
  const array = geometry.getAttribute('position').array.slice();

  geometry.dispose();

  return array;
}

function edgeFeature() {
  const capture = captureSupport(source, soup(source), { normal: [0, 1, 0] })!;
  const offset = addLine(capture.reference, { id: 'r1' }, { at: [-30, -30] }, { horizontal: true, length: 10 })!;
  const construction = {
    ...offset.sketch,
    entities: offset.sketch.entities.map((e) => (e.id === offset.line ? { ...e, ref: true } : e)),
  };
  const rectangle = addRectangle(construction, {
    corner: { id: offset.end },
    opposite: [-10, -10],
    width: 20,
    height: 20,
  })!;
  const solid = sketchSolid(
    placedPlane(capture.face.plane, source),
    { sketch: rectangle.sketch, mode: 'extrude', depth: 5 },
    { id: 'mount-node', name: 'Mount', color: source.color },
  )!;
  const part = partFromSolid({ ...source, kind: 'custom_model', id: 'mount' }, solid);

  return { ...part, sketch: { ...part.sketch!, support: capture.support } };
}

describe('Sketch support dimensional intent', () => {
  it('moves an explicit 10 mm corner offset when the reference edge moves', () => {
    const part = edgeFeature();
    const wider = { ...source, dimensions: { ...source.dimensions, width: 120 } };
    const result = regenerateSketches([wider, part], soup);
    const mount = result.parts[1];
    const r1 = mount.sketch!.sketch.points.find((p) => p.id === 'r1')!;
    const p1 = mount.sketch!.sketch.points.find((p) => p.id === 'p1')!;

    expect(result.failures).toEqual([]);
    expect(r1.x).toBe(-60);
    expect(p1.x).toBe(-50);
    expect(p1.y).toBe(r1.y);
    expect(mount.dimensions.width).toBe(20);
    expect(mount.sketch!.sketch.constraints).toEqual(part.sketch!.sketch.constraints);
  });

  it('retains all prior geometry and reports an unsatisfiable dimensional edit', () => {
    const part = edgeFeature();
    const record = part.sketch!;
    const bad = {
      ...part,
      sketch: {
        ...record,
        sketch: withConstraints(record.sketch, [{ kind: 'distance', a: 'r1', b: 'p1', value: 11 }]),
      },
    };
    const wider = { ...source, dimensions: { ...source.dimensions, width: 120 } };
    const result = regenerateSketches([wider, bad], soup);

    expect(result.failures).toEqual([{ id: part.id, cause: 'solve' }]);
    expect(result.parts[1]).toBe(bad);
    expect(result.parts[1].customNodes).toBe(part.customNodes);
  });

  it('bounds the dependency count before preparing geometry', () => {
    const part = edgeFeature();
    const parts = Array.from({ length: 129 }, (_, i) => ({ ...part, id: `mount-${i}` }));
    const result = regenerateSketches([source, ...parts], () => {
      throw new Error('Oversized graph prepared');
    });

    expect(result.failures).toHaveLength(129);
    expect(new Set(result.failures.map((f) => f.cause))).toEqual(new Set(['limit']));
    expect(result.prepared).toBe(0);
  });
});
