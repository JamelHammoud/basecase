import type { ScenePart } from '../../types/robotics';
import { placedPlane } from './face';
import { partFromSolid, sketchSolid } from './placement';
import { supportRecordProblem } from './supportValidation';
import { solveSketch } from './solver';
import {
  resolveSupport,
  SUPPORT_LIMITS,
  supportFingerprint,
  validSupport,
  validSupportTransform,
  type SupportFailure,
} from './support';

export interface SupportRegeneration {
  parts: ScenePart[];
  failures: Array<{ id: string; cause: SupportFailure }>;
  prepared: number;
  geometryBytes: number;
}

type PrepareSoup = (part: ScenePart) => ArrayLike<number> | SupportFailure;

function dependencyOrder(parts: ScenePart[]) {
  const bound = parts.filter((p) => p.sketch?.support !== undefined);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const levels = new Map<string, number>();
  const order: ScenePart[] = [];
  let pending = bound;

  for (let pass = 0; pass < SUPPORT_LIMITS.depth && pending.length; pass++) {
    const ready = pending.filter((p) => {
      const support = p.sketch!.support;
      const parent = validSupport(support) ? byId.get(support.partId) : undefined;

      return !parent?.sketch?.support || levels.has(parent.id);
    });

    if (!ready.length) break;

    for (const part of ready) {
      const support = part.sketch!.support;
      const depth = validSupport(support) ? (levels.get(support.partId) ?? 0) + 1 : 1;

      levels.set(part.id, depth);
      order.push(part);
    }

    const done = new Set(ready.map((p) => p.id));

    pending = pending.filter((p) => !done.has(p.id));
  }

  return { order, pending, byId };
}

function regenerate(part: ScenePart, source: ScenePart, soup: ArrayLike<number>): ScenePart | SupportFailure {
  const record = part.sketch!;
  const support = record.support!;
  const resolved = resolveSupport(support, source, soup);

  if (resolved.status !== 'ok') return resolved.cause;

  const problem = supportRecordProblem(record);

  if (problem) return problem;

  const reference = new Map(resolved.reference.points.map((p) => [p.id, p]));

  if (support.corners.some((id) => !record.sketch.points.some((p) => p.id === id && p.fixed))) return 'malformed';

  const sketch = { ...record.sketch, points: record.sketch.points.map((p) => reference.get(p.id) ?? p) };
  const solved = solveSketch(sketch);

  if (solved.status !== 'ok') return 'solve';

  const solid = sketchSolid(
    placedPlane(resolved.face.plane, source),
    { ...record, sketch: solved.sketch },
    { id: part.customNodes?.[0]?.id ?? part.id, name: part.name, color: part.color },
  );

  if (!solid) return 'profile';

  const updated = partFromSolid(part, solid);

  return {
    ...updated,
    sketch: {
      ...updated.sketch!,
      support: {
        ...support,
        frame: resolved.face.plane,
        fingerprint: supportFingerprint(source),
        issue: undefined,
        attempt: undefined,
      },
    },
  };
}

interface RegenerationState {
  byId: Map<string, ScenePart>;
  failed: Set<string>;
  prepared: Map<string, ArrayLike<number>>;
  result: SupportRegeneration;
  prepare: PrepareSoup;
  force: ReadonlySet<string>;
}

function preparedSoup(state: RegenerationState, source: ScenePart) {
  const known = state.prepared.get(source.id);

  if (known) return known;

  let soup: ReturnType<PrepareSoup>;

  try {
    soup = state.prepare(source);
  } catch {
    return 'topology';
  }

  if (typeof soup === 'string') return soup;

  state.result.prepared += 1;
  state.result.geometryBytes += soup.length * 8;

  if (state.result.geometryBytes > SUPPORT_LIMITS.geometryBytes) return 'limit';

  state.prepared.set(source.id, soup);

  return soup;
}

function updateDependent(state: RegenerationState, part: ScenePart): ScenePart | SupportFailure {
  const support = part.sketch!.support;

  const problem = supportRecordProblem(part.sketch);

  if (problem || !validSupport(support)) return problem ?? 'malformed';

  const source = state.byId.get(support.partId);

  if (!source) return 'missing';

  if (!validSupportTransform(source)) return 'transform';

  if (state.failed.has(source.id)) return 'upstream';

  const fingerprint = supportFingerprint(source);

  if (fingerprint === 'limit') return 'limit';

  if (support.fingerprint === fingerprint && !state.force.has(part.id)) return part;

  const soup = preparedSoup(state, source);

  return typeof soup === 'string' ? soup : regenerate(part, source, soup);
}

function unresolvedDependency(part: ScenePart, byId: ReadonlyMap<string, ScenePart>): SupportFailure {
  const seen = new Set<string>();
  let current: ScenePart | undefined = part;

  for (let depth = 0; depth <= SUPPORT_LIMITS.depth && current; depth++) {
    if (seen.has(current.id)) return 'cycle';

    seen.add(current.id);

    const support: unknown = current.sketch?.support;

    current = validSupport(support) ? byId.get(support.partId) : undefined;
  }

  return 'limit';
}

export function regenerateSketches(
  parts: ScenePart[],
  prepare: PrepareSoup,
  force: ReadonlySet<string> = new Set(),
): SupportRegeneration {
  const result: SupportRegeneration = { parts, failures: [], prepared: 0, geometryBytes: 0 };
  const bound = parts.filter((p) => p.sketch?.support !== undefined);

  if (bound.length > SUPPORT_LIMITS.parts) {
    result.failures = bound.map((p) => ({ id: p.id, cause: 'limit' }));

    return result;
  }

  if (new Set(parts.map((p) => p.id)).size !== parts.length) {
    result.failures = bound.map((p) => ({ id: p.id, cause: 'malformed' }));

    return result;
  }

  const { order, pending, byId } = dependencyOrder(parts);
  const state: RegenerationState = { byId, failed: new Set(), prepared: new Map(), result, prepare, force };
  const fail = (part: ScenePart, cause: SupportFailure) => {
    state.failed.add(part.id);
    result.failures.push({ id: part.id, cause });
  };

  for (const part of pending) fail(part, unresolvedDependency(part, byId));

  for (const part of order) {
    const next = updateDependent(state, part);

    if (typeof next === 'string') fail(part, next);
    else byId.set(part.id, next);
  }

  result.parts = parts.map((p) => byId.get(p.id) ?? p);

  return result;
}
