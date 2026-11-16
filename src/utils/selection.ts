import { ScenePart } from '../types/robotics';
import { affineBounds } from './affineBounds';

export type Axis = 0 | 1 | 2;
export type AlignMode = 'min' | 'center' | 'max';

const r = (v: number) => Math.round(v * 10) / 10;

export function halfExtents(p: ScenePart): [number, number, number] {
  if (p.sheetTransform) {
    const bounds = affineBounds(p);

    return bounds.min.map((value, axis) => (bounds.max[axis] - value) / 2) as [number, number, number];
  }

  const h = [p.dimensions.width / 2, p.dimensions.height / 2, p.dimensions.depth / 2];
  const [x, y, z] = p.rotation.map((d) => (d * Math.PI) / 180);

  if (x === 0 && y === 0 && z === 0) return [h[0], h[1], h[2]];

  const a = Math.cos(x),
    b = Math.sin(x),
    c = Math.cos(y),
    d = Math.sin(y),
    e = Math.cos(z),
    f = Math.sin(z);
  const m = [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c],
  ];

  return m.map((row) => Math.abs(row[0]) * h[0] + Math.abs(row[1]) * h[1] + Math.abs(row[2]) * h[2]) as [
    number,
    number,
    number,
  ];
}

export function partBounds(p: ScenePart): { min: [number, number, number]; max: [number, number, number] } {
  if (p.sheetTransform) return affineBounds(p);

  const half = halfExtents(p);

  return {
    min: [p.position[0] - half[0], p.position[1] - half[1], p.position[2] - half[2]],
    max: [p.position[0] + half[0], p.position[1] + half[1], p.position[2] + half[2]],
  };
}

export function selectionBounds(parts: ScenePart[]) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const p of parts) {
    const b = partBounds(p);

    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }

  return { min, max };
}

export function expandToGroups(parts: ScenePart[], ids: string[]): string[] {
  const selected = new Set(ids);
  const groupIds = new Set<string>();

  for (const part of parts) {
    if (selected.has(part.id) && part.group?.id) groupIds.add(part.group.id);
  }

  const extra = parts.filter((p) => p.group && groupIds.has(p.group.id) && !selected.has(p.id)).map((p) => p.id);

  return [...ids, ...extra];
}

function alignTarget(bounds: Map<ScenePart, ReturnType<typeof partBounds>>, axis: Axis, mode: AlignMode): number {
  let min = Infinity;
  let max = -Infinity;

  for (const b of bounds.values()) {
    min = Math.min(min, b.min[axis]);
    max = Math.max(max, b.max[axis]);
  }

  if (mode === 'min') return min;

  return mode === 'max' ? max : (min + max) / 2;
}

const ALIGN_FACTOR: Record<AlignMode, number> = { min: 0, center: 0.5, max: 1 };

function unlockedSelection(all: ScenePart[], ids: string[]): ScenePart[] {
  const selected = new Set(ids);

  return all.filter((p) => selected.has(p.id) && !p.locked);
}

export function alignParts(all: ScenePart[], ids: string[], axis: Axis, mode: AlignMode): ScenePart[] {
  const sel = unlockedSelection(all, ids);

  if (sel.length === 0) return all;

  const bounds = new Map(sel.map((p) => [p, partBounds(p)]));
  const target = sel.length === 1 ? 0 : alignTarget(bounds, axis, mode);
  const precise = sel.some((p) => p.sheetTransform);

  return all.map((p) => {
    const b = bounds.get(p);

    if (!b) return p;

    const anchor = b.min[axis] + (b.max[axis] - b.min[axis]) * ALIGN_FACTOR[mode];
    const position: [number, number, number] = [...p.position];

    const at = p.position[axis] + target - anchor;

    position[axis] = precise ? at : r(at);

    return { ...p, position };
  });
}

export function distributeParts(all: ScenePart[], ids: string[], axis: Axis): ScenePart[] {
  const sel = unlockedSelection(all, ids);

  if (sel.length < 3) return all;

  const bounds = new Map(sel.map((p) => [p, partBounds(p)]));
  const center = (p: ScenePart) => bounds.get(p)!.min[axis] + bounds.get(p)!.max[axis];
  const precise = sel.some((p) => p.sheetTransform);

  sel.sort((a, b) => center(a) - center(b));

  const size = (p: ScenePart) => bounds.get(p)!.max[axis] - bounds.get(p)!.min[axis];
  const first = bounds.get(sel[0])!.min[axis];
  const last = bounds.get(sel[sel.length - 1])!.max[axis];
  const total = sel.reduce((sum, p) => sum + size(p), 0);
  const gap = (last - first - total) / (sel.length - 1);
  const next = new Map<string, number>();
  let cursor = first;

  for (const p of sel) {
    const at = p.position[axis] + cursor - bounds.get(p)!.min[axis];

    next.set(p.id, precise ? at : r(at));
    cursor += size(p) + gap;
  }

  return all.map((p) => {
    const v = next.get(p.id);

    if (v === undefined) return p;

    const position: [number, number, number] = [...p.position];

    position[axis] = v;

    return { ...p, position };
  });
}

export function boundsOverlap(a: ScenePart, b: ScenePart): boolean {
  const A = partBounds(a);
  const B = partBounds(b);

  return [0, 1, 2].every((i) => A.min[i] < B.max[i] && B.min[i] < A.max[i]);
}
