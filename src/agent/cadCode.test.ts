import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { twinHints } from '../workspace/mirrorHints';
import { addHoles, HOLES_MARK, mirrorCode, mirroredAxis } from './cadCode';
import { scadStatements } from './scadStatements';

const SCAD = `include <robotics.scad>
w = 20; // width
module lug(h) { cuboid([w, 8, h], rounding=1); }
function half(x) = x / 2;
if (w > 10) { lug(10); } else { cube(1); }
echo("a;b");
right(half(w)) cyl(d=6, h=12);`;

const hole = {
  start: [0, 0, -5] as [number, number, number],
  direction: [0, 0, 1] as [number, number, number],
  diameter: 3.4,
  length: 20,
};

describe('OpenSCAD statements', () => {
  it('splits top-level statements, keeping if/else, strings and comments whole', () => {
    expect(scadStatements(SCAD).map((s) => s.trim())).toEqual([
      'include <robotics.scad>',
      'w = 20;',
      '// width\nmodule lug(h) { cuboid([w, 8, h], rounding=1); }',
      'function half(x) = x / 2;',
      'if (w > 10) { lug(10); } else { cube(1); }',
      'echo("a;b");',
      'right(half(w)) cyl(d=6, h=12);',
    ]);
  });
});

describe('code edits', () => {
  it('mirrors OpenSCAD with definitions kept at the top level', () => {
    const code = mirrorCode('openscad', SCAD, 0);
    const mirrorAt = code.indexOf('mirror([1, 0, 0]) {');

    expect(mirroredAxis(code)).toBe(0);
    expect(code.indexOf('module lug')).toBeLessThan(mirrorAt);
    expect(code.indexOf('right(half(w))')).toBeGreaterThan(mirrorAt);
  });

  it('adds holes once and extends the same block on later calls', () => {
    const once = addHoles('openscad', SCAD, [hole]);
    const twice = addHoles('openscad', once, [hole]);

    expect(once.split(HOLES_MARK)).toHaveLength(2);
    expect(twice.split(HOLES_MARK)).toHaveLength(2);
    expect(twice.match(/cylinder\(d = 3.4/g)).toHaveLength(2);
    expect(twice.trim().endsWith('}')).toBe(true);
  });

  it('wraps replicad code and chains cuts', () => {
    const twice = addHoles('replicad', addHoles('replicad', 'return makeBox([0,0,0],[1,1,1]);', [hole]), [hole]);

    expect(twice.match(/\.cut\(makeCylinder/g)).toHaveLength(2);
    expect(twice.trim().endsWith(';')).toBe(true);
    expect(mirrorCode('replicad', 'return a;', 2)).toContain('.mirror("XY"');
  });
});

describe('twin hints', () => {
  const part = (id: string, mirrorOf?: string) =>
    ({ id, mirrorOf: mirrorOf && { id: mirrorOf, axis: 'x' } }) as ScenePart;

  it('asks to re-mirror after a source edit and warns when a copy is edited', () => {
    const scene = [part('left_foot'), part('right_foot', 'left_foot')];

    expect(twinHints(['left_foot'], scene, scene)[0]).toContain('mirror_parts(["left_foot"])');
    expect(twinHints(['right_foot'], scene, scene)[0]).toContain('make changes on left_foot');
    expect(twinHints(['other'], scene, scene)).toEqual([]);
  });
});
