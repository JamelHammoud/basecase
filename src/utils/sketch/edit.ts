import { solveSketch, type Drag } from './solver';
import type { PairKind, Sketch, SketchConstraint, SketchEntity, SketchPoint, Vec2 } from './types';

export type PointRef = { id: string } | { at: Vec2 };

export interface LineDims {
  horizontal?: boolean;
  vertical?: boolean;
  length?: number;
  angle?: number;
}

type NewConstraint = SketchConstraint extends infer C ? (C extends SketchConstraint ? Omit<C, 'id'> : never) : never;

const idNumber = (id: string, prefix: string) => (id.startsWith(prefix) ? Number(id.slice(prefix.length)) || 0 : 0);

function nextIdNumber(sketch: Sketch, prefix: string): number {
  let highest = 0;

  for (const items of [sketch.points, sketch.entities, sketch.constraints]) {
    for (const item of items) highest = Math.max(highest, idNumber(item.id, prefix));
  }

  return highest + 1;
}

export const nextId = (sketch: Sketch, prefix: string): string => `${prefix}${nextIdNumber(sketch, prefix)}`;

export const pointOf = (sketch: Sketch, id: string) => sketch.points.find((p) => p.id === id);

export const entityOf = (sketch: Sketch, id: string) => sketch.entities.find((e) => e.id === id);

export const xy = (p: SketchPoint): Vec2 => [p.x, p.y];

export function withPoint(sketch: Sketch, ref: PointRef): { sketch: Sketch; id: string } {
  if ('id' in ref) return { sketch, id: ref.id };

  const id = nextId(sketch, 'p');

  return { sketch: { ...sketch, points: [...sketch.points, { id, x: ref.at[0], y: ref.at[1] }] }, id };
}

type NewEntity = SketchEntity extends infer E ? (E extends SketchEntity ? Omit<E, 'id'> : never) : never;

export function withEntity(sketch: Sketch, entity: NewEntity, prefix: string) {
  const id = nextId(sketch, prefix);

  return { sketch: { ...sketch, entities: [...sketch.entities, { ...entity, id } as SketchEntity] }, id };
}

export function withConstraints(sketch: Sketch, added: NewConstraint[]): Sketch {
  if (!added.length) return sketch;

  let next = nextIdNumber(sketch, 'k');
  const constraints = [...sketch.constraints];

  for (const constraint of added) {
    constraints.push({ ...constraint, id: `k${next}` } as SketchConstraint);
    next += 1;
  }

  return { ...sketch, constraints };
}

export function solved(sketch: Sketch, drag?: Drag): Sketch | null {
  const result = solveSketch(sketch, drag);

  return result.status === 'ok' ? result.sketch : null;
}

function lineConstraints(line: string, dims: LineDims): NewConstraint[] {
  const out: NewConstraint[] = [];

  if (dims.angle !== undefined) out.push({ kind: 'angle', line, value: dims.angle });
  else if (dims.horizontal) out.push({ kind: 'horizontal', line });
  else if (dims.vertical) out.push({ kind: 'vertical', line });

  if (dims.length !== undefined && dims.length > 0) out.push({ kind: 'length', line, value: dims.length });

  return out;
}

export function addLine(sketch: Sketch, from: PointRef, to: PointRef, dims: LineDims = {}) {
  const a = withPoint(sketch, from);
  const b = withPoint(a.sketch, to);

  if (a.id === b.id) return null;

  const line = withEntity(b.sketch, { kind: 'line', a: a.id, b: b.id }, 'l');
  const next = solved(withConstraints(line.sketch, lineConstraints(line.id, dims)));

  return next && { sketch: next, end: b.id, line: line.id };
}

export interface RectangleInput {
  corner: PointRef;
  opposite: Vec2;
  width?: number;
  height?: number;
}

const cornerAt = (sketch: Sketch, ref: PointRef): Vec2 => ('id' in ref ? xy(pointOf(sketch, ref.id)!) : ref.at);

export function addRectangle(sketch: Sketch, { corner, opposite, width, height }: RectangleInput) {
  const [x0, y0] = cornerAt(sketch, corner);
  const sx = opposite[0] >= x0 ? 1 : -1;
  const sy = opposite[1] >= y0 ? 1 : -1;
  const x1 = width ? x0 + sx * width : opposite[0];
  const y1 = height ? y0 + sy * height : opposite[1];

  if (x1 === x0 || y1 === y0) return null;

  const p0 = withPoint(sketch, corner);
  const p1 = withPoint(p0.sketch, { at: [x1, y0] });
  const p2 = withPoint(p1.sketch, { at: [x1, y1] });
  const p3 = withPoint(p2.sketch, { at: [x0, y1] });
  const ids = [p0.id, p1.id, p2.id, p3.id];
  let s = p3.sketch;
  const lines: string[] = [];

  for (let i = 0; i < 4; i++) {
    const line = withEntity(s, { kind: 'line', a: ids[i], b: ids[(i + 1) % 4] }, 'l');

    s = line.sketch;
    lines.push(line.id);
  }

  const constraints: NewConstraint[] = [
    { kind: 'horizontal', line: lines[0] },
    { kind: 'vertical', line: lines[1] },
    { kind: 'horizontal', line: lines[2] },
    { kind: 'vertical', line: lines[3] },
  ];

  if (width) constraints.push({ kind: 'length', line: lines[0], value: width });

  if (height) constraints.push({ kind: 'length', line: lines[3], value: height });

  const next = solved(withConstraints(s, constraints));

  return next && { sketch: next, lines };
}

export function addCircle(sketch: Sketch, center: PointRef, radius: number, typed = false) {
  if (!Number.isFinite(radius) || radius <= 0) return null;

  const c = withPoint(sketch, center);
  const circle = withEntity(c.sketch, { kind: 'circle', c: c.id, r: radius }, 'c');
  const dims: NewConstraint[] = typed ? [{ kind: 'radius', entity: circle.id, value: radius }] : [];
  const next = solved(withConstraints(circle.sketch, dims));

  return next && { sketch: next, circle: circle.id };
}

export function addArc(sketch: Sketch, center: PointRef, start: PointRef, end: Vec2) {
  const c = withPoint(sketch, center);
  const a = withPoint(c.sketch, start);
  const cxy = xy(pointOf(a.sketch, c.id)!);
  const r = Math.hypot(...(xy(pointOf(a.sketch, a.id)!).map((v, i) => v - cxy[i]) as Vec2));
  const angle = Math.atan2(end[1] - cxy[1], end[0] - cxy[0]);
  const b = withPoint(a.sketch, { at: [cxy[0] + r * Math.cos(angle), cxy[1] + r * Math.sin(angle)] });

  if (r === 0 || a.id === b.id) return null;

  const arc = withEntity(b.sketch, { kind: 'arc', c: c.id, a: a.id, b: b.id }, 'a');
  const next = solved(arc.sketch);

  return next && { sketch: next, arc: arc.id };
}

export const DIMENSION_OF: Record<SketchEntity['kind'], 'length' | 'radius'> = {
  line: 'length',
  circle: 'radius',
  arc: 'radius',
};

export function dimensionOf(sketch: Sketch, entity: string): SketchConstraint | undefined {
  return sketch.constraints.find(
    (c) => (c.kind === 'length' && c.line === entity) || (c.kind === 'radius' && c.entity === entity),
  );
}

const anchorPoint = (sketch: Sketch, entity?: string): Drag | undefined => {
  const e = entity ? entityOf(sketch, entity) : undefined;
  const id = e && (e.kind === 'line' ? e.a : e.c);
  const p = id ? pointOf(sketch, id) : undefined;

  return p && !p.fixed ? { point: p.id, to: [p.x, p.y] } : undefined;
};

const constrainedEntity = (c?: SketchConstraint) => {
  if (c?.kind === 'length') return c.line;

  return c?.kind === 'radius' ? c.entity : undefined;
};

export function setDimension(sketch: Sketch, entity: string, value: number): Sketch | null {
  const e = entityOf(sketch, entity);

  if (!e || !Number.isFinite(value) || value <= 0) return null;

  const existing = dimensionOf(sketch, entity);

  if (existing) return setConstraintValue(sketch, existing.id, value);

  const added: NewConstraint =
    DIMENSION_OF[e.kind] === 'length' ? { kind: 'length', line: entity, value } : { kind: 'radius', entity, value };

  return solved(withConstraints(sketch, [added]), anchorPoint(sketch, entity));
}

export type ApplyKind = PairKind | 'horizontal' | 'vertical' | 'coincident';

const onlyLines = (sketch: Sketch, ids: string[]) => ids.every((id) => entityOf(sketch, id)?.kind === 'line');

export function applicableConstraints(sketch: Sketch, ids: string[]): ApplyKind[] {
  if (ids.length === 0 || ids.length > 2) return [];

  const kinds = ids.map((id) => entityOf(sketch, id)?.kind ?? (pointOf(sketch, id) ? 'point' : null));
  const lines = kinds.filter((k) => k === 'line').length;
  const rounds = kinds.filter((k) => k === 'circle' || k === 'arc').length;
  const points = kinds.filter((k) => k === 'point').length;

  if (ids.length === 1 && lines === 1) return ['horizontal', 'vertical'];

  if (ids.length !== 2) return [];

  if (lines === 2) return ['parallel', 'perpendicular', 'equal'];

  if (rounds === 2) return ['equal', 'tangent'];

  if (lines === 1 && rounds === 1) return ['tangent'];

  return points >= 1 ? ['coincident'] : [];
}

const pairConstraint = (kind: ApplyKind, ids: string[], sketch: Sketch): NewConstraint => {
  if (kind === 'horizontal' || kind === 'vertical') return { kind, line: ids[0] };

  if (kind === 'coincident') {
    const [p, q] = pointOf(sketch, ids[0]) ? ids : [ids[1], ids[0]];

    return { kind, a: p, b: q };
  }

  return { kind, a: ids[0], b: ids[1] };
};

export function addConstraint(sketch: Sketch, kind: ApplyKind, ids: string[]): Sketch | null {
  if (!applicableConstraints(sketch, ids).includes(kind)) return null;

  if (kind !== 'coincident' && kind !== 'tangent' && kind !== 'equal' && !onlyLines(sketch, ids)) return null;

  return solved(withConstraints(sketch, [pairConstraint(kind, ids, sketch)]));
}

const mentions = (c: SketchConstraint, gone: Set<string>) =>
  Object.entries(c).some(([key, v]) => key !== 'id' && key !== 'kind' && typeof v === 'string' && gone.has(v));

export const entityPoints = (e: SketchEntity) => {
  if (e.kind === 'circle') return [e.c];

  return e.kind === 'arc' ? [e.c, e.a, e.b] : [e.a, e.b];
};

const usedPoints = (entities: SketchEntity[]) => new Set(entities.flatMap(entityPoints));

function removableIds(entities: SketchEntity[], ids: string[]): Set<string> {
  const gone = new Set(ids);
  const unchecked = new Set(gone);

  if (unchecked.size === 0) return gone;

  for (const entity of entities) {
    if (!unchecked.delete(entity.id)) continue;

    if (entity.kind === 'line' && entity.ref) gone.delete(entity.id);

    if (unchecked.size === 0) break;
  }

  return gone;
}

export function removeItems(sketch: Sketch, ids: string[]): Sketch {
  const gone = removableIds(sketch.entities, ids);
  const entities = sketch.entities.filter((e) => !gone.has(e.id));
  const used = usedPoints(entities);
  const points: SketchPoint[] = [];
  const dropped = new Set(gone);

  for (const point of sketch.points) {
    if (point.fixed || used.has(point.id)) points.push(point);
    else dropped.add(point.id);
  }

  return {
    points,
    entities,
    constraints: sketch.constraints.filter((c) => !dropped.has(c.id) && !mentions(c, dropped)),
  };
}

export const dragPoint = (sketch: Sketch, point: string, to: Vec2) =>
  pointOf(sketch, point)?.fixed ? null : solved(sketch, { point, to });

export function polylineSketch(loops: Vec2[][]): Sketch {
  const sketch: Sketch = { points: [], entities: [], constraints: [] };

  for (const loop of loops) {
    const start = sketch.points.length;

    for (let i = 0; i < loop.length; i++) {
      const [x, y] = loop[i];

      sketch.points.push({ id: `p${start + i + 1}`, x, y });
      sketch.entities.push({
        id: `l${sketch.entities.length + 1}`,
        kind: 'line',
        a: `p${start + i + 1}`,
        b: `p${start + ((i + 1) % loop.length) + 1}`,
      });
    }
  }

  return sketch;
}

export function setConstraintValue(sketch: Sketch, constraint: string, value: number): Sketch | null {
  if (!Number.isFinite(value)) return null;

  const target = sketch.constraints.find((c) => c.id === constraint);

  return solved(
    {
      ...sketch,
      constraints: sketch.constraints.map((c) => (c.id === constraint && 'value' in c ? { ...c, value } : c)),
    },
    anchorPoint(sketch, constrainedEntity(target)),
  );
}
