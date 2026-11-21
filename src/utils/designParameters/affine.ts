import { parseExpression, type ExpressionNode } from './expression';
import { resolveParameters } from './resolve';
import type { DesignParameter, ParameterUnit } from './types';

export interface AffineDimension {
  unit: ParameterUnit;
  constant: number;
  terms: Map<string, number>;
}

function scaled(value: AffineDimension, factor: number): AffineDimension {
  if (!Number.isFinite(factor)) throw new Error('Use finite affine dimensional expressions.');

  return {
    ...value,
    constant: value.constant * factor,
    terms: new Map(
      [...value.terms].map(([name, n]) => [name, n * factor]).filter(([, n]) => n !== 0) as Array<[string, number]>,
    ),
  };
}

function combined(left: AffineDimension, right: AffineDimension, sign: number): AffineDimension {
  if (left.unit !== right.unit) throw new Error('Use compatible dimensional units.');

  const terms = new Map(left.terms);

  for (const [name, coefficient] of right.terms) {
    const total = (terms.get(name) ?? 0) + sign * coefficient;

    if (total === 0) terms.delete(name);
    else terms.set(name, total);
  }

  return { unit: left.unit, constant: left.constant + sign * right.constant, terms };
}

function product(op: string, left: AffineDimension, right: AffineDimension): AffineDimension {
  if (op === '/' && right.unit === '1' && !right.terms.size && right.constant !== 0)
    return scaled(left, 1 / right.constant);

  if (op === '*' && right.unit === '1' && !right.terms.size) return scaled(left, right.constant);

  if (op === '*' && left.unit === '1' && !left.terms.size) return scaled(right, left.constant);

  throw new Error('Use signed affine dimensions with constant unitless multipliers and divisors.');
}

export function affineParameters(parameters: DesignParameter[]) {
  resolveParameters(parameters);

  const declared = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  const cache = new Map<string, AffineDimension>();
  const named = (name: string): AffineDimension => {
    const existing = cache.get(name);

    if (existing) return existing;

    const parameter = declared.get(name);

    if (!parameter) throw new Error(`Declare parameter ${name}.`);

    const value =
      parameter.expression === undefined
        ? {
            unit: parameter.unit,
            constant: parameter.unit === 'mm' ? 0 : parameter.value,
            terms: new Map(parameter.unit === 'mm' ? [[name, 1]] : []),
          }
        : evaluate(parseExpression(parameter.expression));

    cache.set(name, value);

    return value;
  };
  const evaluate = (node: ExpressionNode): AffineDimension => {
    if (node.kind === 'literal') return { unit: node.quantity.unit, constant: node.quantity.value, terms: new Map() };

    if (node.kind === 'name') return named(node.name);

    if (node.kind === 'unary') return scaled(evaluate(node.child), node.sign);

    const left = evaluate(node.left);
    const right = evaluate(node.right);

    return node.op === '+' || node.op === '-'
      ? combined(left, right, node.op === '+' ? 1 : -1)
      : product(node.op, left, right);
  };

  return (expression: string) => {
    const result = evaluate(parseExpression(expression));

    if (!Number.isFinite(result.constant) || [...result.terms.values()].some((n) => !Number.isFinite(n)))
      throw new Error('Use finite affine dimensional expressions.');

    return result;
  };
}
