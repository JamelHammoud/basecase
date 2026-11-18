import { describe, expect, it } from 'vitest';
import { evaluateExpression, expressionNames, renameExpression } from './expression';
import { resolveParameters } from './resolve';
import type { DesignParameter } from './types';

const declarations: DesignParameter[] = [
  { name: 'width', unit: 'mm', value: 160 },
  { name: 'margin', unit: 'mm', value: 8 },
  { name: 'spacing', unit: 'mm', expression: 'width - 2 * margin' },
  { name: 'turn', unit: 'deg', value: 90 },
];

describe('bounded dimensional expressions', () => {
  it('resolves forward references deterministically with dimensional arithmetic', () => {
    const values = resolveParameters([...declarations].reverse());

    expect(evaluateExpression('(spacing + 4 mm) / 2', values)).toEqual({ value: 74, unit: 'mm' });
    expect(evaluateExpression('width / (2 * margin)', values)).toEqual({ value: 10, unit: '1' });
    expect(evaluateExpression('-turn + 180 deg', values)).toEqual({ value: 90, unit: 'deg' });
    expect([...values.keys()]).toEqual(['margin', 'width', 'spacing', 'turn']);
  });

  it.each([
    'width + turn',
    'width * margin',
    'turn / width',
    'width / 0',
    '1e309 mm',
    'width ** 2',
    'Math.max(width, 2)',
    'width.constructor',
    'globalThis',
    'width = 2',
    'width; process.exit()',
    '1 2',
    '',
    '('.repeat(65) + 'width' + ')'.repeat(65),
    Array.from({ length: 100 }, () => 'width').join('+'),
  ])('refuses incompatible or malformed input %s', (expression) => {
    expect(() => evaluateExpression(expression, resolveParameters(declarations))).toThrow();
  });

  it('renames exact references without changing literals, units or longer names', () => {
    expect(renameExpression('width + width_extra - 2 mm', 'width', 'chassis')).toBe('chassis + width_extra - 2 mm');
    expect(expressionNames('width + width_extra - 2 mm')).toEqual(['width', 'width_extra']);
  });

  it.each<DesignParameter[]>([
    [
      { name: 'a', unit: 'mm', expression: 'b' },
      { name: 'b', unit: 'mm', expression: 'a' },
    ],
    [{ name: 'a', unit: 'mm', expression: 'missing' }],
    [{ name: 'a', unit: 'deg', expression: '2 mm' }],
    [{ name: 'a', unit: 'mm', value: NaN }],
    [{ name: 'mm', unit: 'mm', value: 2 }],
    [{ name: 'constructor', unit: 'mm', value: 2 }],
    [
      { name: 'a', unit: 'mm', value: 2 },
      { name: 'a', unit: 'mm', value: 3 },
    ],
    Array.from({ length: 18 }, (_, index) => ({
      name: `p${index}`,
      unit: 'mm',
      ...(index ? { expression: `p${index - 1}` } : { value: 1 }),
    })),
  ])('refuses damaged declarations and bounded dependency violations', (...parameters) => {
    expect(() => resolveParameters(parameters)).toThrow();
  });
});
