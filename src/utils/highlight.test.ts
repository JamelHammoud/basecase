import { describe, expect, it } from 'vitest';
import { highlight, highlightLines, type TokenKind } from './highlight';

const kinds = (code: string, language: string) =>
  highlight(code, language)
    .filter((t) => t.text.trim())
    .map((t): [TokenKind, string] => [t.kind, t.text.trim()]);

describe('highlight', () => {
  it('reads OpenSCAD the way the agent writes it', () => {
    const code = 'include <robotics.scad>\n$fn = 41; // smooth\ndifference() { cuboid([40, 20, 4], rounding=2); }';

    expect(kinds(code, 'openscad')).toEqual([
      ['keyword', 'include'],
      ['string', '<robotics.scad>'],
      ['special', '$fn'],
      ['plain', '='],
      ['number', '41'],
      ['plain', ';'],
      ['comment', '// smooth'],
      ['builtin', 'difference'],
      ['plain', '() {'],
      ['function', 'cuboid'],
      ['plain', '(['],
      ['number', '40'],
      ['plain', ','],
      ['number', '20'],
      ['plain', ','],
      ['number', '4'],
      ['plain', '], rounding='],
      ['number', '2'],
      ['plain', '); }'],
    ]);
  });

  it('reads replicad as JavaScript', () => {
    expect(kinds('const s = drawCircle(10).sketchOnPlane("XY"); /* r */ return s;', 'replicad')).toEqual([
      ['keyword', 'const'],
      ['plain', 's ='],
      ['function', 'drawCircle'],
      ['plain', '('],
      ['number', '10'],
      ['plain', ').'],
      ['function', 'sketchOnPlane'],
      ['plain', '('],
      ['string', '"XY"'],
      ['plain', ');'],
      ['comment', '/* r */'],
      ['keyword', 'return'],
      ['plain', 's;'],
    ]);
  });

  it('keeps every character and splits into lines', () => {
    const code = 'a = "x\\"y"; /* two\nlines */ b = 1.5e3;\n\n';
    const lines = highlightLines(code, 'js');

    expect(
      highlight(code, 'js')
        .map((t) => t.text)
        .join(''),
    ).toBe(code);
    expect(lines).toHaveLength(4);
    expect(lines[1].map((t) => t.text).join('')).toBe('lines */ b = 1.5e3;');
    expect(lines[1][0].kind).toBe('comment');
  });

  it('leaves unknown languages plain', () => {
    expect(highlight('if x', 'text')).toEqual([{ kind: 'plain', text: 'if x' }]);
  });
});
