import { describe, expect, it } from 'vitest';
import { evaluate, type XacroValue } from './xacroExpr';

const props = new Map<string, XacroValue>([
  ['width', 0.2],
  ['prefix', 'left_'],
  ['side', 'left'],
  ['reflect', -1],
]);
const run = (text: string) => evaluate(text, (name) => props.get(name));

describe('xacro expressions', () => {
  it('does arithmetic the way Python does', () => {
    expect(run('2 + 3 * 4')).toBe(14);
    expect(run('(2 + 3) * 4')).toBe(20);
    expect(run('-2**2')).toBe(-4);
    expect(run('2**3**2')).toBe(512);
    expect(run('7 // 2')).toBe(3);
    expect(run('-7 % 3')).toBe(2);
    expect(run('width * 2 + 0.1')).toBeCloseTo(0.5);
    expect(run('reflect * width / 2')).toBeCloseTo(-0.1);
  });

  it('knows pi and the math functions', () => {
    expect(run('pi / 2')).toBeCloseTo(Math.PI / 2);
    expect(run('math.pi')).toBeCloseTo(Math.PI);
    expect(run('radians(90)')).toBeCloseTo(Math.PI / 2);
    expect(run('math.cos(0)')).toBe(1);
    expect(run('max(1, width, 3)')).toBe(3);
    expect(run('atan2(1, 1)')).toBeCloseTo(Math.PI / 4);
  });

  it('compares, joins strings and picks with if / else', () => {
    expect(run("side == 'left'")).toBe(true);
    expect(run("side == 'left' and width > 1")).toBe(false);
    expect(run('not False or False')).toBe(true);
    expect(run("prefix + 'link'")).toBe('left_link');
    expect(run("1 if side == 'left' else -1")).toBe(1);
    expect(run("1 if side == 'right' else -1")).toBe(-1);
  });

  it('leaves the branch it doesn’t take unevaluated', () => {
    expect(run('width if True else missing')).toBeCloseTo(0.2);
  });

  it('refuses names it doesn’t know and calls it doesn’t allow', () => {
    for (const text of [
      'missing + 1',
      "__import__('os').system('ls')",
      "open('/etc/passwd').read()",
      "constructor.constructor('return process')()",
      "''.__class__",
      'eval(1)',
      'prefix.upper()',
      'width(1)',
      '(radians)(1)',
      '[1, 2]',
      "{'a': 1}",
      'width; 1',
    ]) {
      expect(() => run(text), text).toThrow();
    }
  });

  it('refuses arithmetic on strings', () => {
    expect(() => run('prefix * 2')).toThrow();
    expect(() => run('prefix + 1')).toThrow();
  });
});
