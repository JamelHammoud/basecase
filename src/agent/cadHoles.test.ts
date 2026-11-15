import { describe, expect, it } from 'vitest';
import { addHoles, HOLES_MARK, mirrorCode, type CodeHole } from './cadCode';
import { generatedHoles } from './cadHoles';

const holes: CodeHole[] = [
  { start: [3, -4, 5], direction: [0, 0, -1], diameter: 7.4, length: 12 },
  { start: [-8, 2, 1], direction: [1, 0, 0], diameter: 3.6, length: 30 },
];

describe('generated mounting holes', () => {
  it.each(['translate([50, 0, 0])', 'rotate([0, 0, 90])', 'mirror([1, 0, 0])'])(
    'refuses an outer OpenSCAD %s even when generated cut lines are unchanged',
    (transform) => {
      const code = addHoles('openscad', 'cube(10);', holes);

      expect(() => generatedHoles('openscad', `${transform} ${code}`)).toThrow('generated holes');
    },
  );

  it('reads a generated OpenSCAD wrapper after allowed top-level definitions', () => {
    const code = addHoles('openscad', 'side = 10;\nmodule body() { cube(side); }\nbody();', holes);

    expect(generatedHoles('openscad', code)).toHaveLength(2);
  });

  it('refuses RepliCAD prefix changes outside its generated body wrapper', () => {
    const code = addHoles('replicad', 'return makeBox([0, 0, 0], [10, 10, 10]);', holes);

    expect(() => generatedHoles('replicad', `makeCylinder = transformedCylinder;\n${code}`)).toThrow('generated holes');
    expect(() =>
      generatedHoles('replicad', code.replace(HOLES_MARK, `makeCylinder = transformedCylinder;\n${HOLES_MARK}`)),
    ).toThrow('generated holes');
  });

  it.each(['openscad', 'replicad'] as const)(
    'reads every numeric cut emitted by %s without running code',
    (language) => {
      const source = language === 'openscad' ? 'cube([30, 30, 10]);' : 'return makeBox([0, 0, 0], [30, 30, 10]);';
      const code = addHoles(language, addHoles(language, source, [holes[0]]), [holes[1]]);
      const recovered = generatedHoles(language, code);

      expect(recovered).toHaveLength(holes.length);

      recovered.forEach((hole, i) => {
        expect(hole.start).toEqual(holes[i].start);
        expect(hole.diameter).toEqual(holes[i].diameter);
        expect(hole).toHaveLength(holes[i].length);
        hole.direction.forEach((value, axis) => expect(value).toBeCloseTo(holes[i].direction[axis], 5));
      });
    },
  );

  it.each(['openscad', 'replicad'] as const)(
    'refuses transformed or edited %s cuts whose frame is uncertain',
    (language) => {
      const source = language === 'openscad' ? 'cube(10);' : 'return makeBox([0, 0, 0], [10, 10, 10]);';
      const code = addHoles(language, source, holes);

      expect(() => generatedHoles(language, mirrorCode(language, code, 0))).toThrow('generated holes');

      const radiusOrDiameter = language === 'openscad' ? '7.4' : '3.7';

      expect(() => generatedHoles(language, code.replace(radiusOrDiameter, 'unknownDiameter'))).toThrow(
        'generated holes',
      );
      expect(generatedHoles(language, source)).toEqual([]);
    },
  );
});
