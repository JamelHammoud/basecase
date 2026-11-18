import { clampDimension, formatDimension } from '../../../electron/cad-kernel/dimensions.mjs';
import { parameterCadDimensions } from './cadDimensions';
import type { ScenePart } from '../../types/robotics';
import { surfaceOperands } from '../../booleans/operands';
import { evaluateExpression } from './expression';
import { resolveParameters, parameterUnit } from './resolve';
import { PARAMETER_LIMITS, type DimensionBinding, type ParameterUnit, type Quantity } from './types';
import { tubeRadii } from '../partEdges';

export interface ParameterPartPlan {
  part: ScenePart;
  kind: DimensionBinding['kind'];
  values: Record<string, number>;
}

export const PRIMITIVES = new Set([
  'box',
  'cube',
  'cylinder',
  'tube',
  'sphere',
  'wedge',
  'torus',
  'cone',
  'pyramid',
  'hex_prism',
  'capsule',
  'dome',
  'hole_cylinder',
  'hole_box',
  'pivot_axis',
]);

const DIMENSIONS = new Set(['width', 'height', 'depth', 'thickness']);

function primitiveTarget(part: ScenePart, target: string): ParameterUnit {
  if (target === 'thickness' && part.kind !== 'tube') throw new Error('Choose an editable tube wall dimension.');

  if (
    !PRIMITIVES.has(part.kind) ||
    part.cad ||
    part.mesh ||
    part.sketch ||
    part.sheet ||
    part.sheetTransform ||
    !DIMENSIONS.has(target)
  )
    throw new Error(`Unsupported primitive dimension ${target}.`);

  if (part.dimensions[target as keyof ScenePart['dimensions']] === undefined)
    throw new Error(`Missing dimension ${target}.`);

  return 'mm';
}

function cadTarget(part: ScenePart, target: string, value: number): void {
  if (part.kind !== 'cad_part' || part.cad?.language !== 'openscad')
    throw new Error('Choose an editable OpenSCAD part.');

  const dimension = parameterCadDimensions(part.cad).find((candidate) => candidate.name === target);

  if (!dimension) throw new Error(`Missing numeric CAD dimension ${target}.`);

  if (clampDimension(dimension, value) !== value) throw new Error(`${target} exceeds its declared range.`);

  if (Math.abs(Number(formatDimension(value)) - value) > 1e-8)
    throw new Error(`${target} exceeds CAD precision of four decimal places.`);
}

function targetUnit(part: ScenePart, binding: DimensionBinding, value: number): ParameterUnit {
  if (part.componentId || part.hardware || part.supplyId || part.kind === 'component' || part.kind === 'hardware')
    throw new Error('Catalog product dimensions can’t be bound.');

  if (binding.kind === 'primitive') return primitiveTarget(part, binding.target);

  if (binding.kind === 'cad') {
    cadTarget(part, binding.target, value);

    return binding.unit;
  }

  const constraint = part.sketch?.sketch.constraints.find((candidate) => candidate.id === binding.target);

  if (!constraint || !('value' in constraint))
    throw new Error(`Missing dimensional Sketch constraint ${binding.target}.`);

  return constraint.kind === 'angle' ? 'deg' : 'mm';
}

function bindingValue(part: ScenePart, binding: DimensionBinding, values: ReadonlyMap<string, Quantity>): number {
  if (
    !binding ||
    typeof binding !== 'object' ||
    !['primitive', 'cad', 'sketch'].includes(binding.kind) ||
    typeof binding.target !== 'string' ||
    !parameterUnit(binding.unit)
  )
    throw new Error('Repair the saved dimension binding.');

  const quantity = evaluateExpression(binding.expression, values);
  const unit = targetUnit(part, binding, quantity.value);

  if (unit !== binding.unit || quantity.unit !== unit)
    throw new Error(`${binding.target} needs ${unit}, got ${quantity.unit}.`);

  if (binding.kind !== 'cad' && binding.unit === 'mm' && quantity.value <= 0)
    throw new Error(`${binding.target} must be greater than zero.`);

  return binding.kind === 'cad' ? Number(formatDimension(quantity.value)) : quantity.value;
}

function planPart(part: ScenePart, values: ReadonlyMap<string, Quantity>): ParameterPartPlan {
  const edits: Record<string, number> = {};
  const bindings = part.dimensionBindings!;
  const kind = bindings[0].kind;

  for (const binding of bindings) {
    if (binding.kind !== kind) throw new Error('Use dimensions from one editing path per part.');

    if (Object.hasOwn(edits, binding.target)) throw new Error(`Dimension ${binding.target} is bound twice.`);

    Object.defineProperty(edits, binding.target, { value: bindingValue(part, binding, values), enumerable: true });
  }

  const dimensions = { ...part.dimensions, ...edits };
  const radii = part.kind === 'tube' ? tubeRadii(dimensions) : undefined;

  if (radii && dimensions.thickness !== undefined && Math.abs(radii.outer - radii.inner - dimensions.thickness) > 1e-8)
    throw new Error('Keep the tube wall inside its editable radius.');

  return { part, kind, values: edits };
}

export function planParameterEdit(parts: ScenePart[], parameters: unknown): ParameterPartPlan[] {
  const values = resolveParameters(parameters);
  const flat = surfaceOperands(parts);

  if (new Set(flat.map((part) => part.id)).size !== flat.length) throw new Error('Each part needs a unique identity.');

  const plans: ParameterPartPlan[] = [];
  let total = 0;

  for (const part of flat) {
    if (part.dimensionBindings === undefined) continue;

    try {
      if (!Array.isArray(part.dimensionBindings)) throw new Error('Repair the saved dimension bindings.');

      total += part.dimensionBindings.length;

      if (total > PARAMETER_LIMITS.bindings) throw new Error('Use at most 512 bound dimensions.');

      if (part.dimensionBindings.length) plans.push(planPart(part, values));
    } catch (error) {
      throw new Error(`${part.name} (${part.id}): ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  return plans;
}
