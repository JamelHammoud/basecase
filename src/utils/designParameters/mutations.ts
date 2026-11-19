import { editWithOperands, surfaceOperands } from '../../booleans/operands';
import type { ScenePart } from '../../types/robotics';
import { expressionNames, parameterName, renameExpression, substituteExpression } from './expression';
import { planParameterEdit } from './plan';
import { resolveParameters } from './resolve';
import type { DesignParameter, DimensionalRequirement } from './types';

export interface ParameterDesign {
  parts: ScenePart[];
  parameters: DesignParameter[];
  requirements?: DimensionalRequirement[];
}

export function parameterDependents(design: ParameterDesign, name: string): string[] {
  return [
    ...(design.requirements ?? [])
      .filter(
        (item) =>
          expressionNames(item.expression).includes(name) ||
          item.dimensions.some((dimension) => dimension.parameter === name),
      )
      .map((item) => `requirement:${item.name}`),
    ...design.parameters
      .filter((p) => p.expression && expressionNames(p.expression).includes(name))
      .map((p) => `parameter:${p.name}`),
    ...surfaceOperands(design.parts).flatMap((part) =>
      (part.dimensionBindings ?? [])
        .filter((binding) => expressionNames(binding.expression).includes(name))
        .map((binding) => `${part.id}:${binding.kind}:${binding.target}`),
    ),
  ];
}

function rewriteReferences(design: ParameterDesign, rewrite: (expression: string) => string): ParameterDesign {
  const parameters = design.parameters.map((p) => {
    if (p.expression === undefined) return p;

    const expression = rewrite(p.expression);

    return expression === p.expression ? p : { ...p, expression };
  });
  const parts = editWithOperands(design.parts, (flat) =>
    flat.map((part) => {
      if (!part.dimensionBindings?.length) return part;

      const dimensionBindings = part.dimensionBindings.map((binding) => {
        const expression = rewrite(binding.expression);

        return expression === binding.expression ? binding : { ...binding, expression };
      });

      return dimensionBindings.every((binding, index) => binding === part.dimensionBindings![index])
        ? part
        : { ...part, dimensionBindings };
    }),
  );

  const requirements = design.requirements?.map((item) => ({ ...item, expression: rewrite(item.expression) }));

  return { ...design, parts, parameters, ...(requirements ? { requirements } : {}) };
}

export function renameParameter(design: ParameterDesign, before: string, after: string): ParameterDesign {
  planParameterEdit(design.parts, design.parameters);

  if (
    !parameterName(after) ||
    !design.parameters.some((p) => p.name === before) ||
    design.parameters.some((p) => p.name === after)
  )
    throw new Error('Choose a declared parameter and an unused parameter name.');

  const rewritten = rewriteReferences(design, (expression) => renameExpression(expression, before, after));
  const parameters = rewritten.parameters.map((p) => (p.name === before ? { ...p, name: after } : p));
  const requirements = rewritten.requirements?.map((item) => ({
    ...item,
    dimensions: item.dimensions.map((dimension) =>
      dimension.parameter === before ? { ...dimension, parameter: after } : dimension,
    ),
  }));
  const result = { ...rewritten, parameters, ...(requirements ? { requirements } : {}) };

  planParameterEdit(result.parts, result.parameters);

  return result;
}

export function removeParameter(design: ParameterDesign, name: string, resolution?: 'freeze'): ParameterDesign {
  planParameterEdit(design.parts, design.parameters);

  const quantity = resolveParameters(design.parameters).get(name);

  if (!quantity) throw new Error(`Declare parameter ${name}.`);

  const dependents = parameterDependents(design, name);

  if (dependents.length && resolution !== 'freeze') throw new Error(`${name} is used by ${dependents.join(', ')}.`);

  if (design.requirements?.length)
    throw new Error('Remove dimensional requirements before freezing or deleting a parameter.');

  const literal = `(${quantity.value}${quantity.unit === '1' ? '' : ` ${quantity.unit}`})`;
  const rewrite = (expression: string) => substituteExpression(expression, name, literal);
  const result = rewriteReferences(design, rewrite);

  result.parameters = result.parameters.filter((p) => p.name !== name);
  planParameterEdit(result.parts, result.parameters);

  return result;
}
