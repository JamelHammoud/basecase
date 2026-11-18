import { applySpec } from '../../agent/agentScene';
import { followMates } from '../../agent/mateFollow';
import { surfaceOperands } from '../../booleans/operands';
import { regenerateSketchParts } from '../../three/sketchSupportOps';
import type { ScenePart } from '../../types/robotics';
import { partFromSolid, partPlane, sketchSolid } from '../sketch/placement';
import { solveSketch } from '../sketch/solver';
import { PARAMETER_LIMITS } from './types';
import type { ParameterGeometryJob } from './transaction';
import { changedParameterPlan } from './scope';
import { regenerateParameterBooleans } from './booleanGeometry';
import { provideMeshFiles } from '../../three/componentMeshes';

function sketchPart(part: ScenePart, values: Record<string, number>): ScenePart {
  const record = part.sketch!;
  const constraints = record.sketch.constraints.map((constraint) =>
    Object.hasOwn(values, constraint.id) && 'value' in constraint
      ? { ...constraint, value: values[constraint.id] }
      : constraint,
  );
  const sketch = { ...record.sketch, constraints };

  if (record.support)
    return { ...part, sketch: { ...record, sketch, support: { ...record.support, attempt: undefined } } };

  const solved = solveSketch(sketch);

  if (solved.status !== 'ok') throw new Error(`${part.name} (${part.id}): Sketch constraints conflict.`);

  const solid = sketchSolid(
    partPlane(part),
    { ...record, sketch: solved.sketch },
    { id: part.id, name: part.name, color: part.color },
  );

  if (!solid) throw new Error(`${part.name} (${part.id}): Sketch needs a closed solid.`);

  return partFromSolid(part, solid);
}

function followed(before: ScenePart[], after: ScenePart[]) {
  const result = followMates({ before, after, placed: new Set() });

  if (result.notes.length) throw new Error(result.notes.join(' '));

  const updated = new Map(result.updated.map((part) => [part.id, part]));

  return after.map((part) => updated.get(part.id) ?? part);
}

function supported(parts: ScenePart[], force: string[]) {
  const result = regenerateSketchParts(parts, force);
  const failure = result.failures[0];

  if (failure)
    throw new Error(
      `${parts.find((part) => part.id === failure.id)?.name} (${failure.id}): Sketch support regeneration failed (${failure.cause}).`,
    );

  const updated = new Map(result.updated.map((part) => [part.id, part]));

  return { parts: parts.map((part) => updated.get(part.id) ?? part), count: updated.size };
}

export async function regenerateParameterGeometry(job: ParameterGeometryJob): Promise<ScenePart[]> {
  provideMeshFiles(job.meshFiles);

  const byId = new Map(job.cad.map(({ id, payload }) => [id, payload]));
  const edits = new Map(
    job.plans
      .filter((plan) => changedParameterPlan(plan) || job.verify || job.force?.includes(plan.part.id))
      .map((plan) => [plan.part.id, plan]),
  );
  const original = surfaceOperands(job.parts);
  let parts = original.map((part) => {
    const cad = byId.get(part.id);
    const edit = edits.get(part.id);

    if (cad) return applySpec(part, { id: part.id, cad });

    if (!edit) return part;

    return edit.kind === 'primitive'
      ? { ...part, dimensions: { ...part.dimensions, ...edit.values } }
      : sketchPart(part, edit.values);
  });
  const force = [...edits.values()]
    .filter((plan) => plan.kind === 'sketch' && plan.part.sketch?.support)
    .map((plan) => plan.part.id);

  parts = followed(original, parts);

  for (let pass = 0; pass <= PARAMETER_LIMITS.depth; pass++) {
    const regenerated = supported(parts, pass === 0 ? force : []);
    const booleans = surfaceOperands(await regenerateParameterBooleans(job.parts, regenerated.parts));
    const next = followed(parts, booleans);
    const settled = next.every((part, index) => part === parts[index]);

    parts = next;

    if (settled) return parts.filter((part, index) => part !== original[index]);
  }

  throw new Error('Dimension and support dependencies did not settle.');
}
