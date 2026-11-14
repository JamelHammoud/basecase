import type { BooleanData, BooleanOp, ScenePart } from '../types/robotics';

export type Vec3 = [number, number, number];

export type BooleanPart = ScenePart & { boolean: BooleanData };

export interface BooleanResult {
  positions: number[];
  indices: number[];
  offset: Vec3;
  size: Vec3;
}

export const isBooleanPart = (part: ScenePart | undefined | null): part is BooleanPart =>
  part?.kind === 'boolean' && !!part.boolean;

export const operandsOf = (part: ScenePart): ScenePart[] => (isBooleanPart(part) ? part.boolean.operands : []);

export const baseOf = (part: BooleanPart): ScenePart => part.boolean.operands[0];

export function findPartDeep(parts: ScenePart[], id: string): ScenePart | undefined {
  for (const part of parts) {
    if (part.id === id) return part;

    const inner = findPartDeep(operandsOf(part), id);

    if (inner) return inner;
  }

  return undefined;
}

export function parentBoolean(parts: ScenePart[], id: string): BooleanPart | undefined {
  for (const part of parts) {
    if (!isBooleanPart(part)) continue;

    if (part.boolean.operands.some((o) => o.id === id)) return part;

    const inner = parentBoolean(part.boolean.operands, id);

    if (inner) return inner;
  }

  return undefined;
}

export const operandIdsDeep = (parts: ScenePart[]): string[] =>
  parts.flatMap((p) => operandsOf(p).flatMap((o) => [o.id, ...operandIdsDeep([o])]));

function asOperand(part: ScenePart): ScenePart {
  const operand = { ...part, visible: true };

  delete operand.group;

  return operand;
}

export interface NewBoolean {
  id: string;
  base: ScenePart;
  tools: ScenePart[];
  op: BooleanOp;
}

export function booleanPart({ id, base, tools, op }: NewBoolean): BooleanPart {
  const sameGroup = tools.every((t) => t.group?.id === base.group?.id) ? base.group : undefined;

  return {
    id,
    name: base.name,
    kind: 'boolean',
    category: 'custom_models',
    role: base.role === 'cutout' ? 'cutout' : 'solid',
    position: [...base.position],
    rotation: [...base.rotation],
    dimensions: { width: base.dimensions.width, height: base.dimensions.height, depth: base.dimensions.depth },
    color: base.color,
    note: base.note,
    mechanicalTag: base.mechanicalTag || '3D Printed PLA/PETG',
    visible: true,
    locked: false,
    ...(sameGroup ? { group: sameGroup } : {}),
    ...(base.printMaterial ? { printMaterial: base.printMaterial } : {}),
    ...(base.sheet ? { sheet: { ...base.sheet } } : {}),
    boolean: { op, operands: [base, ...tools].map(asOperand) },
  };
}

const EMPTY_MESH = { positions: [], indices: [], baseSize: [1, 1, 1] as Vec3 };

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const centi = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

export function withResult(part: BooleanPart, hash: string, result: BooleanResult | null): BooleanPart {
  const base = baseOf(part);
  const position = result
    ? (base.position.map((v, i) => centi(v + result.offset[i])) as Vec3)
    : part.position.map((v) => v);
  const dimensions = result
    ? { ...part.dimensions, width: result.size[0], height: result.size[1], depth: result.size[2] }
    : part.dimensions;
  const mesh = result ? { positions: result.positions, indices: result.indices, baseSize: result.size } : EMPTY_MESH;
  const frame = { position: position as Vec3, rotation: [...part.rotation] as Vec3, dimensions };

  return { ...part, position: position as Vec3, dimensions, mesh, boolean: { ...part.boolean, hash, frame } };
}

export const sameVec = (a: readonly number[], b: readonly number[]) => a.every((v, i) => near(v, b[i]));

export function freshOperandIds(part: ScenePart, newId: () => string): ScenePart {
  if (!isBooleanPart(part)) return part;

  const operands = part.boolean.operands.map((o) => ({ ...freshOperandIds(o, newId), id: newId() }));

  return { ...part, boolean: { ...part.boolean, operands } };
}
