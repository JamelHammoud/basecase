import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { addRectangle } from './edit';
import { placedPlane } from './face';
import { partFromSolid, partPlane, sketchSolid } from './placement';
import { captureSupport, resolveSupport } from './support';
import { regenerateSketches } from './supportRegeneration';
import { EMPTY_SKETCH } from './types';

const designs = [
  'Rover deck and battery pocket',
  'Arm pedestal and mounting holes',
  'Quadruped hip bracket',
  'Hexapod body and electronics standoffs',
  'Pan-tilt camera mount',
  'Gripper jaw pad',
  'Sensor enclosure lid',
  'Wheel hub flange',
  'Linkage ground plate',
  'Appliance service opening',
];

function source(name = designs[0]): ScenePart {
  return {
    id: 'support',
    name,
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
}

function soup(part: ScenePart, segments = 1) {
  const { width, height, depth } = part.dimensions;
  const geometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments).toNonIndexed();
  const positions = geometry.getAttribute('position').array.slice();

  geometry.dispose();

  return positions;
}

function feature(on: ScenePart): ScenePart {
  const captured = captureSupport(on, soup(on), { normal: [0, 1, 0] })!;
  const rectangle = addRectangle(captured.reference, {
    corner: { at: [-30, -20] },
    opposite: [-10, 0],
    width: 20,
    height: 20,
  })!;
  const sketch = rectangle.sketch;
  const solid = sketchSolid(
    placedPlane(captured.face.plane, on),
    { sketch, mode: 'extrude', depth: 4 },
    { id: 'node', name: 'Mount', color: '#888888' },
  )!;
  const part = partFromSolid({ ...source('Mount'), id: 'feature', mechanicalTag: 'PLA' }, solid);

  return { ...part, sketch: { ...part.sketch!, support: captured.support } };
}

describe('persistent Sketch face support', () => {
  it('resolves the same local face after retriangulation without triangle identities', () => {
    const part = source();
    const captured = captureSupport(part, soup(part), { normal: [0, 1, 0] })!;
    const result = resolveSupport(captured.support, part, soup(part, 3));

    expect(result.status).toBe('ok');

    if (result.status !== 'ok') return;

    expect(result.face.plane).toEqual(captured.face.plane);
    expect(result.reference).toEqual(captured.reference);
  });

  it.each(designs)('regenerates %s with preserved millimeter intent and manufacturing data', (name) => {
    const before = source(name);
    const mount = feature(before);
    const after: ScenePart = {
      ...before,
      position: [31, 42, -17],
      rotation: [20, 35, 10],
      dimensions: { width: 120, height: 24, depth: 90 },
    };
    const result = regenerateSketches([after, mount], (p) => soup(p));
    const updated = result.parts.find((p) => p.id === mount.id)!;
    const plane = partPlane(updated);
    const captured = captureSupport(after, soup(after), { normal: [0, 1, 0] })!;
    const expected = placedPlane(captured.face.plane, after);

    expect(result.failures).toEqual([]);
    expect(plane.origin).toEqual(expected.origin.map((n) => Math.round(n * 1e6) / 1e6));
    expect(updated.dimensions).toEqual(mount.dimensions);
    expect(updated.sketch!.sketch.points.filter((p) => !p.fixed)).toEqual(
      mount.sketch!.sketch.points.filter((p) => !p.fixed),
    );
    expect(updated.sketch!.support!.partId).toBe(before.id);
    expect(updated.mechanicalTag).toBe('PLA');
    expect(updated.id).toBe(mount.id);
    expect(before.position).toEqual([0, 0, 0]);
  });

  it('refuses off-surface picks instead of selecting a nearby face', () => {
    const part = source();
    const geometry = soup(part);

    expect(captureSupport(part, geometry, { point: [0, 5, 0] })).not.toBeNull();

    for (const point of [
      [0, 6, 0],
      [100, 5, 100],
      [0, NaN, 0],
    ] as [number, number, number][]) {
      expect(captureSupport(part, geometry, { point })).toBeNull();
    }
  });

  it('keeps ordinary unbound sketches unchanged', () => {
    const rectangle = addRectangle(EMPTY_SKETCH, {
      corner: { at: [0, 0] },
      opposite: [10, 10],
      width: 10,
      height: 10,
    })!;
    const part = {
      ...source(),
      sketch: { sketch: rectangle.sketch, mode: 'extrude' as const, depth: 3, anchor: [5, 5] as [number, number] },
    };

    expect(
      regenerateSketches([part], () => {
        throw new Error('Unrelated geometry prepared');
      }).parts[0],
    ).toBe(part);
  });

  it('keeps last valid geometry when the source is deleted', () => {
    const mount = feature(source());
    const result = regenerateSketches([mount], (p) => soup(p));

    expect(result.failures).toEqual([{ id: mount.id, cause: 'missing' }]);
    expect(result.parts[0]).toBe(mount);
  });

  it('rejects competing parallel faces rather than choosing the nearest', () => {
    const part = source();
    const captured = captureSupport(part, soup(part), { normal: [0, 1, 0] })!;
    const shifted = Array.from(soup(part), (v, i) => (i % 3 === 1 ? v + 20 : v));
    const ambiguous = [...soup(part), ...shifted];

    expect(resolveSupport(captured.support, part, ambiguous)).toEqual({ status: 'unresolved', cause: 'ambiguous' });
  });

  it('rejects malformed saved references and nonfinite source transforms', () => {
    const part = source();
    const captured = captureSupport(part, soup(part), { normal: [0, 1, 0] })!;

    for (const malformed of [
      null,
      {},
      { ...captured.support, normal: [0, NaN, 0] },
      { ...captured.support, frame: { ...captured.face.plane, origin: [0, Infinity, 0] } },
    ]) {
      expect(resolveSupport(malformed, part, soup(part)).status).toBe('unresolved');
    }

    expect(resolveSupport(captured.support, { ...part, rotation: [0, NaN, 0] }, soup(part))).toEqual({
      status: 'unresolved',
      cause: 'transform',
    });
  });

  it('rejects cycles without preparing geometry', () => {
    const a = feature(source());
    const b = { ...feature(source()), id: 'second' };
    const first = { ...a, sketch: { ...a.sketch!, support: { ...a.sketch!.support!, partId: b.id } } };
    const second = { ...b, sketch: { ...b.sketch!, support: { ...b.sketch!.support!, partId: a.id } } };
    const result = regenerateSketches([first, second], () => {
      throw new Error('Cycle prepared geometry');
    });

    expect(result.failures).toEqual([
      { id: first.id, cause: 'cycle' },
      { id: second.id, cause: 'cycle' },
    ]);
    expect(result.parts).toEqual([first, second]);
  });

  it('preserves support references through JSON save and reopen', () => {
    const part = source();
    const mount = feature(part);
    const reopened: ScenePart[] = JSON.parse(JSON.stringify([part, mount]));
    const result = regenerateSketches(reopened, (p) => soup(p));

    expect(result.failures).toEqual([]);
    expect(result.parts[1].sketch!.support).toEqual(mount.sketch!.support);
  });
});
