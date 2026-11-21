import type { ScenePart } from '../types/robotics';

type AppearanceFields = Pick<ScenePart, 'appearance' | 'boolean' | 'customNodes'>;

const physical = new WeakMap<object, object>();

function physicalPart<T extends AppearanceFields>(part: T): T {
  const known = physical.get(part);

  if (known) return known as T;

  const operands = part.boolean ? physicalParts(part.boolean.operands) : undefined;
  const nodes = part.customNodes?.map((node) => {
    const child = node.part ? physicalPart(node.part) : undefined;

    return child === node.part ? node : { ...node, part: child };
  });
  const nodesChanged = nodes?.some((node, index) => node !== part.customNodes![index]);
  const operandsChanged = operands !== part.boolean?.operands;
  const next = { ...part };

  delete next.appearance;

  if (part.boolean && operandsChanged) next.boolean = { ...part.boolean, operands: operands! };

  if (nodesChanged) next.customNodes = nodes;

  const value = part.appearance || operandsChanged || nodesChanged ? next : part;

  physical.set(part, value);

  return value;
}

export function physicalParts(parts: ScenePart[]): ScenePart[] {
  const next = parts.map(physicalPart);

  return next.every((part, index) => part === parts[index]) ? parts : next;
}
