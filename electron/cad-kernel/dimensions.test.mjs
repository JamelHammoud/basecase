import { describe, expect, it } from 'vitest';
import { clampDimension, formatDimension, rewriteDimensions, scadDimensions } from './dimensions.mjs';

const BRACKET = `// basecase: mirror x
include <robotics.scad>
/* Bracket for the hip servo. Print flat. */
wall = 2; // [1.2:0.4:4]
clearance = .25;
holes = 4; // [6]
$fn = 48;
w = 2 * wall;
module lug(h) { depth = 9; cuboid([w, depth, h]); }
difference() {
  union() {
    mirror([1, 0, 0]) {
      lug(wall + 10);
    }
  }
  // basecase: holes
  translate([0, 0, -1]) rotate([0, 0, 0]) cylinder(d = 3.4, h = 20, $fn = 32);
}`;

const changedSpan = (before, after) => {
  let start = 0;

  while (before[start] === after[start]) start++;

  let tail = 0;

  while (tail < before.length - start && before.at(-1 - tail) === after.at(-1 - tail)) tail++;

  return { removed: before.slice(start, before.length - tail), added: after.slice(start, after.length - tail) };
};

describe('OpenSCAD dimensions', () => {
  it('lists top-level numeric assignments with their Customizer ranges', () => {
    expect(scadDimensions(BRACKET).map(({ name, value, min, step, max }) => ({ name, value, min, step, max }))).toEqual(
      [
        { name: 'wall', value: 2, min: 1.2, step: 0.4, max: 4 },
        { name: 'clearance', value: 0.25, min: undefined, step: undefined, max: undefined },
        { name: 'holes', value: 4, min: 0, step: undefined, max: 6 },
      ],
    );
  });

  it('leaves out special variables, expressions, names inside modules and names assigned twice', () => {
    const names = scadDimensions(`${BRACKET}\nclearance = 0.3;`).map((d) => d.name);

    expect(names).toEqual(['wall', 'holes']);
  });

  it('rewrites only the edited literal and keeps comments and basecase blocks byte for byte', () => {
    const after = rewriteDimensions(BRACKET, { wall: 3 });

    expect(changedSpan(BRACKET, after)).toEqual({ removed: '2', added: '3' });
    expect(after.replace('wall = 3;', 'wall = 2;')).toBe(BRACKET);
    expect(after).toContain('// basecase: mirror x\n');
    expect(after).toContain('  // basecase: holes\n  translate([0, 0, -1])');
  });

  it('rewrites several literals at once', () => {
    const after = rewriteDimensions(BRACKET, { clearance: 0.3, holes: 2 });

    expect(after).toBe(BRACKET.replace('clearance = .25;', 'clearance = 0.3;').replace('holes = 4;', 'holes = 2;'));
  });

  it('clamps to the min and max of the Customizer comment', () => {
    const [wall] = scadDimensions(BRACKET);

    expect([9, 0.5, 3].map((v) => clampDimension(wall, v))).toEqual([4, 1.2, 3]);
    expect(rewriteDimensions(BRACKET, { wall: 9 })).toContain('wall = 4; // [1.2:0.4:4]');
    expect(rewriteDimensions(BRACKET, { holes: -2 })).toContain('holes = 0; // [6]');
  });

  it('writes plain decimals, never exponents', () => {
    expect(formatDimension(0.00001)).toBe('0');
    expect(formatDimension(1234.56789)).toBe('1234.5679');
    expect(formatDimension(-2.5)).toBe('-2.5');
    expect(() => formatDimension(1e21)).toThrow();
  });
});
