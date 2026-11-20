import type { ScenePart } from '../types/robotics';
import { CRADLE_LIMITS } from './cradleTypes';

type SourceState = Pick<ScenePart, 'cad' | 'sketch' | 'boolean' | 'customNodes'>;

export function unresolvedCradleSources(parts: ScenePart[]): boolean {
  if (parts.length > CRADLE_LIMITS.maxSourceNodes) return true;

  const pending: Array<{ part: SourceState; depth: number }> = parts.map((part) => ({ part, depth: 0 }));
  let visited = 0;

  while (pending.length) {
    const { part, depth } = pending.pop()!;

    visited++;

    if (depth > CRADLE_LIMITS.maxSourceDepth || sourcePending(part)) return true;

    const operands = part.boolean?.operands ?? [];
    const nodes = part.customNodes ?? [];

    if (visited + pending.length + operands.length + nodes.length > CRADLE_LIMITS.maxSourceNodes) return true;

    for (const operand of operands) pending.push({ part: operand, depth: depth + 1 });

    for (const node of nodes) {
      if (node.part) pending.push({ part: node.part, depth: depth + 1 });
    }
  }

  return false;
}

function sourcePending(part: SourceState): boolean {
  return !!part.cad?.pending || !!part.sketch?.support?.issue;
}
