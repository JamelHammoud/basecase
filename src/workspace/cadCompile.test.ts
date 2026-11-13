import { describe, expect, it } from 'vitest';
import { add, rotate, sub, type V3 } from '../agent/agentFrame';
import type { ScenePart } from '../types/robotics';
import { checkedRender } from '../utils/platform/renderedCad';
import type { RenderedCad } from '../utils/platform/types';
import { compiledDoc, compiledPart, isCompiled, pendingCompiles, type CompiledCad } from './cadCompile';

const CODE = 'include <robotics.scad>\ncuboid([10, 20, 30], anchor=BOTTOM+LEFT+FRONT);';

const CORNERS: V3[] = [
  [0, 0, 0],
  [10, 0, 0],
  [0, 20, 0],
  [10, 20, 0],
  [0, 0, 30],
  [10, 0, 30],
  [0, 20, 30],
  [10, 20, 30],
];

const box = (): CompiledCad => ({
  ok: true,
  positions: CORNERS.flat(),
  indices: [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7],
  edges: null,
  stats: { volume: 6000 },
  ports: [{ name: 'horn', position: [5, 10, 30], axis: [0, 0, 1], kind: 'bore', diameterMm: 6 }],
  audit: { bodies: 1, genus: 0, nonManifoldEdges: 0, openEdges: 0, hullVolume: 6000 },
});

function placeholder(id: string, rotation: V3, code = CODE): ScenePart {
  const originOffset: V3 = [0, 2, 0];

  return {
    id,
    name: 'Bracket',
    kind: 'cad_part',
    category: 'custom_models',
    role: 'solid',
    position: add([100, 50, -20], rotate(originOffset, rotation)),
    rotation,
    dimensions: { width: 4, height: 4, depth: 4 },
    color: '#e4e4e7',
    visible: true,
    cad: {
      language: 'openscad',
      code,
      positions: [-2, -2, -2, 2, -2, -2, 0, 2, 2],
      indices: [0, 1, 2],
      originOffset,
      baseSize: [4, 4, 4],
      pending: true,
    },
  } as ScenePart;
}

const frameOrigin = (p: ScenePart) => sub(p.position, rotate(p.cad!.originOffset, p.rotation));

describe('compiledPart', () => {
  it('keeps the frame origin of a rotated part where it was', () => {
    const part = placeholder('a', [0, 90, 30]);
    const next = compiledPart(part, box());

    frameOrigin(next).forEach((v, k) => expect(v).toBeCloseTo(frameOrigin(part)[k], 2));
    expect(next.cad!.originOffset).toEqual([5, 15, -10]);
  });

  it('sizes the part from the compiled mesh and drops the pending flag', () => {
    const next = compiledPart(placeholder('a', [0, 0, 0]), box());

    expect(next.dimensions).toEqual({ width: 10, height: 30, depth: 20 });
    expect(next.cad!.baseSize).toEqual([10, 30, 20]);
    expect(next.cad!.volume).toBe(6000);
    expect(next.cad!.indices).toHaveLength(12);
    expect(next.cad!.ports?.[0].name).toBe('horn');
    expect(next.cad!.audit?.bodies).toBe(1);
    expect('pending' in next.cad!).toBe(false);
  });

  it('leaves the part alone when the kernel failed', () => {
    const part = placeholder('a', [0, 0, 0]);

    expect(compiledPart(part, { ok: false, error: 'boom' })).toBe(part);
  });
});

describe('compiledDoc', () => {
  it('patches the pending parts with that code in the doc and its history, and nothing else', () => {
    const a = placeholder('a', [0, 0, 0]);
    const other = placeholder('b', [0, 0, 0], 'cube(1);');
    const d = {
      parts: [a, other],
      past: [{ parts: [a], pose: undefined, joints: undefined, marks: undefined, skeleton: undefined }],
      future: [],
      base: null,
    };
    const next = compiledDoc(d, `openscad\n${CODE}`, box());

    expect(next.parts[0].cad!.pending).toBeUndefined();
    expect(next.parts[1]).toBe(other);
    expect(next.past[0].parts[0].dimensions.height).toBe(30);
  });
});

describe('pendingCompiles', () => {
  it('compiles each pending code once, skips what is in flight or failed, and stops at the limit', () => {
    const parts = [
      placeholder('a', [0, 0, 0]),
      placeholder('b', [0, 0, 0]),
      placeholder('c', [0, 0, 0], 'cube(1);'),
      placeholder('d', [0, 0, 0], 'cube(2);'),
    ];

    expect(pendingCompiles(parts, new Set(), 2).map((j) => j.code)).toEqual([CODE, 'cube(1);']);
    expect(pendingCompiles(parts, new Set([`openscad\n${CODE}`]), 2).map((j) => j.code)).toEqual([
      'cube(1);',
      'cube(2);',
    ]);
    expect(pendingCompiles(parts, new Set(), 0)).toEqual([]);
  });
});

describe('checkedRender', () => {
  it('turns the stubbed bridge reply and broken meshes into failures', () => {
    const broken: unknown[] = [
      {},
      null,
      { ok: true, positions: [0, 0], indices: [0, 0, 0] },
      { ok: true, positions: [0, 0, 0], indices: [0, 0, 1] },
      { ok: true, positions: [0, 0, 'x'], indices: [0, 0, 0] },
    ];

    for (const raw of broken) expect(isCompiled(checkedRender(raw))).toBe(false);
  });

  it('keeps only the fields it knows from a hostile reply', () => {
    const raw = {
      ...box(),
      stats: { volume: 6000, bbox: {} },
      audit: {
        ...box().audit,
        spots: [{ at: [0, 0, 0] }],
        ports: [box().ports![0], { name: 'bad', position: [0, 0], axis: [0, 0, 1], kind: 'bore' }],
      },
      extra: '<script>',
    };
    const out: RenderedCad = checkedRender(raw);

    expect(isCompiled(out)).toBe(true);
    expect(out.ports).toHaveLength(1);
    expect(out.audit).toEqual(box().audit);
    expect(out).not.toHaveProperty('extra');
  });
});
