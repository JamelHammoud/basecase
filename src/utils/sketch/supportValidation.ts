import type { PartSketch, SketchConstraint, SketchEntity } from './types';
import { SUPPORT_LIMITS, validSupport, type SupportFailure } from './support';

const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

function validEntity(e: SketchEntity, points: Set<string>) {
  if (e.kind === 'line') return points.has(e.a) && points.has(e.b) && e.a !== e.b;

  if (e.kind === 'circle') return points.has(e.c) && finite(e.r) && e.r > 0;

  return e.kind === 'arc' && [e.a, e.b, e.c].every((p) => points.has(p));
}

interface References {
  points: Set<string>;
  entities: Map<string, SketchEntity>;
}

function validUnary(c: SketchConstraint, entities: References['entities']) {
  const line = (v: string) => entities.get(v)?.kind === 'line';

  if (c.kind === 'radius') return entities.get(c.entity)?.kind === 'circle' && c.value > 0;

  if (!('line' in c) || !line(c.line)) return false;

  if (c.kind === 'length') return c.value > 0;

  if (c.kind === 'angle') return c.other === undefined || line(c.other);

  return c.kind === 'horizontal' || c.kind === 'vertical';
}

function validPair(c: SketchConstraint, refs: References) {
  if (!('a' in c) || !('b' in c)) return false;

  const pointOrEntity = (v: string) => refs.points.has(v) || refs.entities.has(v);

  switch (c.kind) {
    case 'coincident':
      return refs.points.has(c.a) && pointOrEntity(c.b);
    case 'distance':
      return pointOrEntity(c.a) && pointOrEntity(c.b) && c.value >= 0;
    case 'parallel':
    case 'perpendicular':
      return refs.entities.get(c.a)?.kind === 'line' && refs.entities.get(c.b)?.kind === 'line';
    default:
      return new Set(['equal', 'tangent']).has(c.kind) && refs.entities.has(c.a) && refs.entities.has(c.b);
  }
}

function validConstraint(c: SketchConstraint, refs: References) {
  if ('value' in c && !finite(c.value)) return false;

  return 'line' in c || c.kind === 'radius' ? validUnary(c, refs.entities) : validPair(c, refs);
}

function referenceEdges(record: PartSketch, entities: Map<string, SketchEntity>) {
  const corners = record.support!.corners;

  return corners.every((corner, i) => {
    const edge = entities.get(`e${i + 1}`);

    return edge?.kind === 'line' && edge.ref === true && edge.a === corner && edge.b === corners[(i + 1) % 4];
  });
}

function validSketch(record: PartSketch) {
  const sketch = record.sketch;
  const all = [...sketch.points, ...sketch.entities, ...sketch.constraints];

  if (!all.every((v) => object(v) && id(v.id))) return false;

  const points = new Set(sketch.points.map((p) => p.id));
  const entities = new Map(sketch.entities.map((e) => [e.id, e]));

  return (
    new Set(all.map((v) => v.id)).size === all.length &&
    sketch.points.every((p) => finite(p.x) && finite(p.y) && (p.fixed === undefined || typeof p.fixed === 'boolean')) &&
    referenceEdges(record, entities) &&
    sketch.entities.every((e) => validEntity(e, points)) &&
    sketch.constraints.every((c) => validConstraint(c, { points, entities })) &&
    record.support!.corners.every((corner) => sketch.points.some((p) => p.id === corner && p.fixed))
  );
}

export function supportRecordProblem(value: unknown): SupportFailure | null {
  if (!object(value) || !validSupport(value.support) || !object(value.sketch)) return 'malformed';

  const record = value as unknown as PartSketch;
  const sketch = record.sketch;

  if (!Array.isArray(sketch.points) || !Array.isArray(sketch.entities) || !Array.isArray(sketch.constraints))
    return 'malformed';

  if (sketch.points.length + sketch.entities.length + sketch.constraints.length > SUPPORT_LIMITS.sketchItems)
    return 'limit';

  if (
    !['extrude', 'revolve'].includes(record.mode) ||
    !finite(record.depth) ||
    !Array.isArray(record.anchor) ||
    record.anchor.length !== 2 ||
    !record.anchor.every(finite)
  )
    return 'malformed';

  return validSketch(record) ? null : 'malformed';
}
