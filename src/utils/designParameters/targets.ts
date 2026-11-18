import { parameterCadDimensions } from './cadDimensions';
import type { ScenePart } from '../../types/robotics';
import type { DimensionBinding, ParameterUnit, DesignParameter } from './types';
import { PRIMITIVES } from './plan';

export interface ParameterTarget {
  value: string;
  label: string;
  kind: DimensionBinding['kind'];
  target: string;
  unit: ParameterUnit;
}

export function parameterTargets(part: ScenePart | null): ParameterTarget[] {
  if (!part || part.componentId || part.hardware || part.supplyId || part.sheet || part.sheetTransform) return [];

  if (part.sketch)
    return part.sketch.sketch.constraints
      .filter((constraint) => 'value' in constraint)
      .map((constraint) => ({
        value: `sketch:${constraint.id}`,
        label: `${constraint.kind} ${constraint.id}`,
        kind: 'sketch',
        target: constraint.id,
        unit: constraint.kind === 'angle' ? 'deg' : 'mm',
      }));

  if (part.cad?.language === 'openscad')
    return parameterCadDimensions(part.cad).map((row) => ({
      value: `cad:${row.name}`,
      label: row.name,
      kind: 'cad',
      target: row.name,
      unit: 'mm',
    }));

  if (!PRIMITIVES.has(part.kind) || part.cad || part.mesh) return [];

  const targets = ['width', 'height', 'depth'];

  if (part.kind === 'tube' && part.dimensions.thickness !== undefined) targets.push('thickness');

  return targets.map((target) => ({
    value: `primitive:${target}`,
    label: target,
    kind: 'primitive',
    target,
    unit: 'mm',
  }));
}

export function enteredParameter(name: string, unit: ParameterUnit, text: string): DesignParameter {
  const numeric = text.trim() !== '' && Number.isFinite(Number(text));

  return numeric ? { name, unit, value: Number(text) } : { name, unit, expression: text };
}
