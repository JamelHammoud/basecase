import { evaluateExpression, expressionNames, parameterName } from './expression';
import { validateDeviation } from './toleranceValidation';
import { PARAMETER_LIMITS, type DesignParameter, type ParameterUnit, type Quantity } from './types';

export const parameterUnit = (unit: unknown): unit is ParameterUnit => unit === 'mm' || unit === 'deg' || unit === '1';

function checkedParameter(parameter: unknown): asserts parameter is DesignParameter {
  if (!parameter || typeof parameter !== 'object') throw new Error('Repair the saved parameter declaration.');

  const record = parameter as Record<string, unknown>;
  const literal = typeof record.value === 'number' && Number.isFinite(record.value) && record.expression === undefined;
  const expression = typeof record.expression === 'string' && record.value === undefined;

  if (!parameterName(record.name) || !parameterUnit(record.unit) || (!literal && !expression))
    throw new Error('Declare a parameter name, unit and finite value or expression.');

  validateDeviation(parameter as DesignParameter);
}

interface Resolution {
  declared: ReadonlyMap<string, DesignParameter>;
  values: Map<string, Quantity>;
  visiting: Set<string>;
  depths: Map<string, number>;
}

function resolve(state: Resolution, name: string, depth: number): Quantity {
  if (depth > PARAMETER_LIMITS.depth) throw new Error('Parameter dependencies exceed 16 levels.');

  if (state.visiting.has(name)) throw new Error(`Circular parameter dependency at ${name}.`);

  const cached = state.values.get(name);

  if (cached) return cached;

  const parameter = state.declared.get(name);

  if (!parameter) throw new Error(`Declare parameter ${name}.`);

  state.visiting.add(name);

  const quantity = resolveValue(state, parameter, depth);

  if (quantity.unit !== parameter.unit) throw new Error(`${name} needs ${parameter.unit}, got ${quantity.unit}.`);

  state.visiting.delete(name);
  state.values.set(name, quantity);

  return quantity;
}

function resolveValue(state: Resolution, parameter: DesignParameter, depth: number): Quantity {
  if (parameter.expression === undefined) {
    state.depths.set(parameter.name, 0);

    return { value: parameter.value, unit: parameter.unit };
  }

  const names = expressionNames(parameter.expression).sort();

  for (const dependency of names) resolve(state, dependency, depth + 1);

  const dependencyDepth = names.reduce((max, name) => Math.max(max, (state.depths.get(name) ?? 0) + 1), 0);

  if (dependencyDepth > PARAMETER_LIMITS.depth) throw new Error('Parameter dependencies exceed 16 levels.');

  state.depths.set(parameter.name, dependencyDepth);

  return evaluateExpression(parameter.expression, state.values);
}

export function resolveParameters(parameters: unknown): Map<string, Quantity> {
  if (!Array.isArray(parameters) || parameters.length > PARAMETER_LIMITS.declarations)
    throw new Error('Use at most 128 declared parameters.');

  const state: Resolution = { declared: new Map(), values: new Map(), visiting: new Set(), depths: new Map() };
  const declared = new Map<string, DesignParameter>();

  for (const parameter of parameters) {
    checkedParameter(parameter);

    if (declared.has(parameter.name)) throw new Error(`Parameter ${parameter.name} is declared twice.`);

    declared.set(parameter.name, parameter);
  }

  state.declared = declared;

  for (const name of [...declared.keys()].sort()) resolve(state, name, 0);

  return state.values;
}
