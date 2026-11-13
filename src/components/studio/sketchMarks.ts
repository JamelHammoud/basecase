import { dimensionOf, entityOf } from '../../utils/sketch/edit';
import type { Sketch, SketchConstraint, SketchEntity, Vec2 } from '../../utils/sketch/types';

export type GlyphKind = 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'equal' | 'tangent' | 'coincident';

export interface Glyph {
  key: string;
  constraint: string;
  kind: GlyphKind;
  at: Vec2;
}

export interface DimensionLabel {
  key: string;
  entity?: string;
  constraint?: string;
  value: number;
  at: Vec2;
}

type Lookup = (id: string) => Vec2;

const lookup = (sketch: Sketch): Lookup => {
  const map = new Map(sketch.points.map((p) => [p.id, [p.x, p.y] as Vec2]));

  return (id) => map.get(id) ?? [0, 0];
};

const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const normalOf = (a: Vec2, b: Vec2): Vec2 => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;

  return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
};

const offset = (p: Vec2, n: Vec2, by: number): Vec2 => [p[0] + n[0] * by, p[1] + n[1] * by];

function segmentDistance(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));

  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function radiusOf(sketch: Sketch, e: SketchEntity) {
  const at = lookup(sketch);

  if (e.kind === 'circle') return e.r;

  if (e.kind === 'arc') return Math.hypot(at(e.a)[0] - at(e.c)[0], at(e.a)[1] - at(e.c)[1]);

  return 0;
}

function entityDistance(sketch: Sketch, e: SketchEntity, p: Vec2) {
  const at = lookup(sketch);

  if (e.kind === 'line') return segmentDistance(p, at(e.a), at(e.b));

  const c = at(e.c);

  return Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - radiusOf(sketch, e));
}

export function hitTest(sketch: Sketch, p: Vec2, tolerance: number): { point?: string; entity?: string } | null {
  const near = sketch.points
    .filter((q) => !q.fixed && Math.hypot(q.x - p[0], q.y - p[1]) <= tolerance)
    .sort((a, b) => Math.hypot(a.x - p[0], a.y - p[1]) - Math.hypot(b.x - p[0], b.y - p[1]))[0];

  if (near) return { point: near.id };

  const entity = sketch.entities
    .map((e) => ({ e, d: entityDistance(sketch, e, p) }))
    .filter(({ d }) => d <= tolerance)
    .sort((a, b) => a.d - b.d)[0];

  return entity ? { entity: entity.e.id } : null;
}

export function measuredValue(sketch: Sketch, e: SketchEntity) {
  const at = lookup(sketch);

  if (e.kind === 'line') return Math.hypot(at(e.b)[0] - at(e.a)[0], at(e.b)[1] - at(e.a)[1]);

  return e.kind === 'circle' ? e.r * 2 : radiusOf(sketch, e);
}

function centroid(sketch: Sketch): Vec2 {
  const own = sketch.points.filter((p) => !p.fixed);
  const pts = own.length ? own : sketch.points;

  return [pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1), pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1)];
}

function outward(sketch: Sketch, at: Vec2, normal: Vec2): Vec2 {
  const [cx, cy] = centroid(sketch);
  const away = (at[0] - cx) * normal[0] + (at[1] - cy) * normal[1];

  return away < 0 ? [-normal[0], -normal[1]] : normal;
}

function anchorOf(sketch: Sketch, id: string, gap: number): { at: Vec2; normal: Vec2 } {
  const at = lookup(sketch);
  const e = entityOf(sketch, id);

  if (!e) return { at: at(id), normal: [0, 1] };

  if (e.kind === 'line')
    return { at: mid(at(e.a), at(e.b)), normal: outward(sketch, mid(at(e.a), at(e.b)), normalOf(at(e.a), at(e.b))) };

  const c = at(e.c);
  const r = radiusOf(sketch, e);

  return { at: [c[0], c[1] + r + gap], normal: [0, 1] };
}

function labelAt(sketch: Sketch, c: SketchConstraint, gap: number): Vec2 {
  if (c.kind === 'length') {
    const { at, normal } = anchorOf(sketch, c.line, gap);

    return offset(at, normal, gap * 1.6);
  }

  if (c.kind === 'radius') return anchorOf(sketch, c.entity, gap).at;

  if (c.kind === 'angle') return offset(anchorOf(sketch, c.line, gap).at, anchorOf(sketch, c.line, gap).normal, -gap);

  if (c.kind === 'distance') {
    const pts = lookup(sketch);
    const ends = [c.a, c.b].map((id) => (entityOf(sketch, id) ? anchorOf(sketch, id, gap).at : pts(id)));

    return mid(ends[0], ends[1]);
  }

  return [0, 0];
}

const dimensionEntity = (c: SketchConstraint) => {
  if (c.kind === 'length') return c.line;

  return c.kind === 'radius' ? c.entity : undefined;
};

const shownValue = (sketch: Sketch, c: SketchConstraint & { value: number }) =>
  c.kind === 'radius' && entityOf(sketch, c.entity)?.kind === 'circle' ? c.value * 2 : c.value;

const isDimension = (c: SketchConstraint): c is SketchConstraint & { value: number } => 'value' in c;

export function dimensionLabels(sketch: Sketch, selected: string[], gap: number): DimensionLabel[] {
  const labels: DimensionLabel[] = sketch.constraints.filter(isDimension).map((c) => ({
    key: c.id,
    constraint: c.id,
    entity: dimensionEntity(c),
    value: shownValue(sketch, c),
    at: labelAt(sketch, c, gap),
  }));
  const loose = selected
    .map((id) => entityOf(sketch, id))
    .filter((e): e is SketchEntity => !!e && !dimensionOf(sketch, e.id) && !(e.kind === 'line' && e.ref));

  return [
    ...labels,
    ...loose.map((e) => {
      const { at, normal } = anchorOf(sketch, e.id, gap);

      return {
        key: `measure-${e.id}`,
        entity: e.id,
        value: measuredValue(sketch, e),
        at: e.kind === 'line' ? offset(at, normal, gap * 1.6) : at,
      };
    }),
  ];
}

const GLYPH_TARGETS: Record<GlyphKind, (c: SketchConstraint) => string[]> = {
  horizontal: (c) => [(c as { line: string }).line],
  vertical: (c) => [(c as { line: string }).line],
  parallel: (c) => [(c as { a: string }).a, (c as { b: string }).b],
  perpendicular: (c) => [(c as { a: string }).a, (c as { b: string }).b],
  equal: (c) => [(c as { a: string }).a, (c as { b: string }).b],
  tangent: (c) => [(c as { a: string }).a, (c as { b: string }).b],
  coincident: (c) => [(c as { a: string }).a],
};

export function constraintGlyphs(sketch: Sketch, gap: number): Glyph[] {
  const stacked = new Map<string, number>();
  const glyphs: Glyph[] = [];

  for (const c of sketch.constraints) {
    if (!(c.kind in GLYPH_TARGETS)) continue;

    const kind = c.kind as GlyphKind;

    for (const target of GLYPH_TARGETS[kind](c)) {
      const n = stacked.get(target) ?? 0;
      const { at, normal } = anchorOf(sketch, target, gap);
      const along: Vec2 = [normal[1], -normal[0]];

      stacked.set(target, n + 1);
      glyphs.push({
        key: `${c.id}-${target}`,
        constraint: c.id,
        kind,
        at: offset(offset(at, normal, -gap), along, n * gap * 1.4),
      });
    }
  }

  return glyphs;
}
