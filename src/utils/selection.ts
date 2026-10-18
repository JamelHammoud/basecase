import { ScenePart } from '../types/robotics';

export type Axis = 0 | 1 | 2;
export type AlignMode = 'min' | 'center' | 'max';

const r = (v: number) => Math.round(v * 10) / 10;

export function halfExtents(p: ScenePart): [number, number, number] {
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
  const groupIds = new Set(ids.map((id) => parts.find((p) => p.id === id)?.group?.id).filter(Boolean) as string[]);
  const extra = parts.filter((p) => p.group && groupIds.has(p.group.id) && !ids.includes(p.id)).map((p) => p.id);

  return [...ids, ...extra];
}

function alignTarget(sel: ScenePart[], axis: Axis, mode: AlignMode): number {
  if (sel.length === 1) return 0;

  const b = selectionBounds(sel);

  if (mode === 'min') return b.min[axis];

  return mode === 'max' ? b.max[axis] : (b.min[axis] + b.max[axis]) / 2;
}

const ALIGN_SIGN: Record<AlignMode, number> = { min: 1, center: 0, max: -1 };

export function alignParts(all: ScenePart[], ids: string[], axis: Axis, mode: AlignMode): ScenePart[] {
  const sel = all.filter((p) => ids.includes(p.id) && !p.locked);

  if (sel.length === 0) return all;

  const target = alignTarget(sel, axis, mode);

  return all.map((p) => {
    if (!sel.includes(p)) return p;

    const center = target + ALIGN_SIGN[mode] * halfExtents(p)[axis];
    const position: [number, number, number] = [...p.position];

    position[axis] = r(center);

    return { ...p, position };
  });
}

export function distributeParts(all: ScenePart[], ids: string[], axis: Axis): ScenePart[] {
  const sel = all.filter((p) => ids.includes(p.id) && !p.locked).sort((a, b) => a.position[axis] - b.position[axis]);

  if (sel.length < 3) return all;

  const size = (p: ScenePart) => halfExtents(p)[axis] * 2;
  const first = partBounds(sel[0]).min[axis];
  const last = partBounds(sel[sel.length - 1]).max[axis];
  const total = sel.reduce((sum, p) => sum + size(p), 0);
  const gap = (last - first - total) / (sel.length - 1);
  const next = new Map<string, number>();
  let cursor = first;

  for (const p of sel) {
    next.set(p.id, r(cursor + size(p) / 2));
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
