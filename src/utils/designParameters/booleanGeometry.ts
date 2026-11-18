import { editWithOperands } from '../../booleans/operands';
import { evaluateBooleanJob } from '../../booleans/csg';
import { builtPieces, plainResult } from '../../booleans/evaluate';
import { booleanHash } from '../../booleans/hash';
import { baseOf, isBooleanPart, withResult } from '../../booleans/parts';
import type { ScenePart } from '../../types/robotics';
import { loadComponentMesh } from '../../three/componentMeshes';

async function preparedOperand(part: ScenePart) {
  if (part.componentId) await loadComponentMesh(part.componentId);

  return part;
}

async function regenerate(part: ScenePart): Promise<ScenePart> {
  if (!isBooleanPart(part)) return preparedOperand(part);

  const operands = await Promise.all(part.boolean.operands.map(regenerate));
  const same = operands.every((operand, index) => operand === part.boolean.operands[index]);
  const next = same ? part : { ...part, boolean: { ...part.boolean, operands } };
  const hash = booleanHash(next);

  if (next.boolean.hash === hash) return next;

  try {
    const result = plainResult(
      await evaluateBooleanJob({
        op: next.boolean.op,
        operands: operands.map(builtPieces),
        origin: baseOf(next).position,
        rotation: next.rotation,
      }),
    );

    if (!result) throw new Error('The CAD kernel returned no solid geometry.');

    return withResult(next, hash, result);
  } catch (error) {
    throw new Error(`${part.name} (${part.id}): ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

export async function regenerateParameterBooleans(roots: ScenePart[], parts: ScenePart[]) {
  const current = new Map(parts.map((part) => [part.id, part]));
  const rebuilt = editWithOperands(roots, (flat) => flat.map((part) => current.get(part.id) ?? part));

  return Promise.all(rebuilt.map((part) => (isBooleanPart(part) ? regenerate(part) : part)));
}
