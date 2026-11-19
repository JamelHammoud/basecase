import { currentParameterValue } from './plan';
import { formatDimension } from '../../../electron/cad-kernel/dimensions.mjs';
import { resolveParameters } from './resolve';
import { surfaceOperands } from '../../booleans/operands';
import { errorMessage } from '../errorMessage';
import { parameterName } from './expression';
import { affineParameters, type AffineDimension } from './affine';
import type { ParameterDesign } from './mutations';
import type { DimensionalRequirement, ManufacturingDeviation } from './types';

export interface StackResult {
  name: string;
  status: 'pass' | 'fail' | 'unresolved';
  nominal: number | null;
  minimum: number | null;
  maximum: number | null;
  contributors: Array<{ parameter: string; coefficient: number; nominal: number; tolerance?: ManufacturingDeviation }>;
  dimensions: DimensionalRequirement['dimensions'];
  reason?: string;
}

function sameAffine(a: AffineDimension, b: AffineDimension) {
  return (
    a.unit === b.unit &&
    a.constant === b.constant &&
    a.terms.size === b.terms.size &&
    [...a.terms].every(([name, n]) => b.terms.get(name) === n)
  );
}

function checkedRequirement(requirement: DimensionalRequirement) {
  if (
    !requirement ||
    !parameterName(requirement.name) ||
    !Number.isFinite(requirement.minimum) ||
    !Number.isFinite(requirement.maximum) ||
    requirement.minimum > requirement.maximum ||
    !Array.isArray(requirement.dimensions) ||
    !requirement.dimensions.length ||
    requirement.dimensions.length > 128
  )
    throw new Error(
      'Declare a named dimensional requirement with a finite acceptable interval and dimension references.',
    );
}

function stackContext(design: ParameterDesign) {
  return {
    affine: affineParameters(design.parameters),
    nominalValues: resolveParameters(design.parameters),
    parts: new Map(surfaceOperands(design.parts).map((part) => [part.id, part])),
    declarations: new Map(design.parameters.map((parameter) => [parameter.name, parameter])),
  };
}

type StackContext = ReturnType<typeof stackContext>;

function checkedStack(context: StackContext, requirement: DimensionalRequirement, verifyGeometry = false) {
  checkedRequirement(requirement);

  const { affine, nominalValues, parts } = context;
  const stack = affine(requirement.expression);
  const covered = new Set<string>();

  if (stack.unit !== 'mm') throw new Error('Declare dimensional requirements in mm.');

  for (const dimension of requirement.dimensions) {
    if (!nominalValues.has(dimension.parameter))
      throw new Error('Reference a declared parameter for each manufacturing dimension.');

    const part = parts.get(dimension.part);
    const binding = part?.dimensionBindings?.find(
      (item) => item.kind === dimension.kind && item.target === dimension.target,
    );
    const declared = affine(dimension.parameter);

    if (!binding || binding.unit !== 'mm' || !sameAffine(affine(binding.expression), declared))
      throw new Error(
        `Bind ${dimension.part}:${dimension.target} to ${dimension.parameter} before checking its tolerance.`,
      );

    const actual = currentParameterValue({ part: part!, kind: binding.kind, values: {} }, binding.target);
    const nominal = nominalValues.get(dimension.parameter)!.value;
    const expected = binding.kind === 'cad' ? Number(formatDimension(nominal)) : nominal;

    if (verifyGeometry && actual !== expected)
      throw new Error(`Regenerate ${dimension.part}:${dimension.target} before checking its tolerance.`);

    for (const name of declared.terms.keys()) covered.add(name);
  }

  if ([...stack.terms.keys()].some((name) => !covered.has(name)))
    throw new Error('Identify every contributing dimension in the requirement.');

  return stack;
}

function checkedRequirements(design: ParameterDesign) {
  const requirements = design.requirements === undefined ? [] : design.requirements;

  if (!Array.isArray(requirements) || requirements.length > 128)
    throw new Error('Use at most 128 dimensional requirements.');

  if (new Set(requirements.map((item) => item?.name)).size !== requirements.length)
    throw new Error('Use unique dimensional requirement names.');

  return requirements;
}

export function validateRequirements(design: ParameterDesign) {
  const requirements = checkedRequirements(design);

  if (!requirements.length) return;

  const context = stackContext(design);

  for (const requirement of requirements) checkedStack(context, requirement);
}

function analyzeStack(context: StackContext, requirement: DimensionalRequirement): StackResult {
  const stack = checkedStack(context, requirement, true);
  const { declarations } = context;
  const contributors = [...stack.terms]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([parameter, coefficient]) => {
      const declaration = declarations.get(parameter)!;

      return {
        parameter,
        coefficient,
        nominal: declaration.value!,
        ...(declaration.tolerance ? { tolerance: declaration.tolerance } : {}),
      };
    });
  const nominal = contributors.reduce((sum, item) => sum + item.nominal * item.coefficient, stack.constant);
  const base = { name: requirement.name, nominal, contributors, dimensions: requirement.dimensions };

  if (contributors.some((item) => !item.tolerance))
    return {
      ...base,
      status: 'unresolved',
      minimum: null,
      maximum: null,
      reason: 'Declare manufacturing deviations for every contributing dimension.',
    };

  let minimum = nominal;
  let maximum = nominal;

  for (const item of contributors) {
    const a = item.coefficient * item.tolerance!.lower;
    const b = item.coefficient * item.tolerance!.upper;

    minimum += Math.min(a, b);
    maximum += Math.max(a, b);
  }

  if (![nominal, minimum, maximum].every(Number.isFinite)) throw new Error('Use finite dimensional bounds.');

  return {
    ...base,
    minimum,
    maximum,
    status: minimum >= requirement.minimum && maximum <= requirement.maximum ? 'pass' : 'fail',
  };
}

function unresolvedStack(requirement: DimensionalRequirement | undefined, error: unknown): StackResult {
  return {
    name: requirement?.name ?? '',
    status: 'unresolved',
    nominal: null,
    minimum: null,
    maximum: null,
    contributors: [],
    dimensions: requirement?.dimensions ?? [],
    reason: errorMessage(error),
  };
}

export function analyzeTolerances(design: ParameterDesign): StackResult[] {
  try {
    const requirements = checkedRequirements(design);

    if (!requirements.length) return [];

    const context = stackContext(design);

    return requirements.map((requirement) => {
      try {
        return analyzeStack(context, requirement);
      } catch (error) {
        return unresolvedStack(requirement, error);
      }
    });
  } catch (error) {
    return [unresolvedStack(undefined, error)];
  }
}
