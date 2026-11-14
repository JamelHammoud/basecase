import { describe, expect, it } from 'vitest';
import { findInScene } from './sceneQuery.mjs';
import { sceneText } from './sceneText.mjs';

const part = (i, group) => ({
  id: `p${i}`,
  name: `Part ${i}`,
  kind: 'hardware',
  position: [i, 0, 10.004],
  rotation: [0, 0, 0],
  size: [3, 3, 6],
  bounds: { min: [i - 1.5, -1.5, 7], max: [i + 1.5, 1.5, 13] },
  color: '#c9a14a',
  role: 'solid',
  group,
  material: 'cots',
  note: 'Printed hole Ø3.2 × 4.0 mm deep, M2 screw, pressed in from the inside of the shell.',
});

const scene = (count) => ({
  frame: 'mm, Z up',
  parts: Array.from({ length: count }, (_, i) => part(i, i % 2 ? 'Head' : 'Torso')),
  bounds: { min: [0, 0, 0], max: [10, 10, 10], size: [10, 10, 10] },
});

describe('sceneText', () => {
  it('lists one compact line per part, leaving out defaults', () => {
    const lines = sceneText(scene(2)).split('\n');

    expect(lines[2]).toBe('2 parts:');
    expect(lines[3]).toMatch(/^p0 "Part 0" hardware group="Torso" pos=\[0,0,10\] size=\[3,3,6\] box=/);
    expect(lines[3]).not.toMatch(/rot=|role=|edges=/);
    expect(sceneText({ ...scene(0), parts: [{ ...part(0), edges: { kind: 'fillet', mm: 3 } }] })).toMatch(
      / size=\[3,3,6\] edges=fillet:3 box=/,
    );
  });

  it('filters by group and ids, and names ids it can’t find', () => {
    expect(sceneText(scene(4), { group: 'head' })).toContain('2 of 4 parts:');

    const text = sceneText(scene(4), { ids: ['p1', 'nope'] });

    expect(text).toContain('1 of 4 parts:');
    expect(text).toContain('Not in the scene: nope.');
  });

  it('summarizes a scene of more than 20 parts by group, with ids', () => {
    const text = sceneText(scene(24));

    expect(text).toContain('"Torso": 12 parts');
    expect(text).toContain('ids p0 p2 p4');
    expect(text).not.toContain('pos=');
  });

  it('leaves notes out of a long filtered list', () => {
    const text = sceneText(scene(600), { group: 'Head' });

    expect(text).toContain('300 of 600 parts:');
    expect(text).not.toContain('note=');
    expect(text.length).toBeLessThan(50000);
  });

  it('shows ports in the full lines', () => {
    const snap = scene(1);

    snap.parts[0].ports = 'horn, case-hole-1…4';

    expect(sceneText(snap)).toContain('ports=horn, case-hole-1…4');
  });
});

const operand = (id, operandOf, over = {}) => ({
  id,
  name: id,
  kind: 'box',
  position: [0, 0, 2],
  rotation: [0, 0, 0],
  size: [40, 30, 4],
  bounds: { min: [-20, -15, 0], max: [20, 15, 4] },
  color: '#888888',
  role: 'solid',
  operandOf,
  ...over,
});

const booleanOf = (id, op, operands, over = {}) => ({
  ...operand(id, undefined, over),
  kind: `boolean (${op})`,
  operands: operands.map((o) => ({ ...o, operandOf: id })),
});

describe('sceneText with booleans', () => {
  const hole = operand('hole', 'cut', { kind: 'hole_cylinder', position: [5, 0, 2], size: [6, 6, 10], role: 'cutout' });
  const cut = booleanOf('cut', 'subtract', [operand('plate'), hole], { group: 'Base' });

  it('lists a boolean with its operation and operand ids, then each operand indented, base first', () => {
    const lines = sceneText({ ...scene(0), parts: [cut] }).split('\n');

    expect(lines[2]).toBe('1 part:');
    expect(lines[3]).toMatch(
      /^cut "cut" boolean\(subtract\) group="Base" pos=\[0,0,2\] size=\[40,30,4\] .*operands=\[plate,hole\]/,
    );
    expect(lines[4]).toMatch(/^ {2}plate "plate" box pos=\[0,0,2\] size=\[40,30,4\] .*operand-of=cut/);
    expect(lines[5]).toMatch(
      /^ {2}hole "hole" hole_cylinder pos=\[5,0,2\] size=\[6,6,10\] .*role=cutout operand-of=cut/,
    );
  });

  it('nests a boolean inside a boolean, and finds an operand by id', () => {
    const merged = booleanOf('merged', 'union', [operand('block'), operand('knob')]);
    const outer = booleanOf('outer', 'subtract', [merged, operand('slot')]);
    const snap = { ...scene(2), parts: [...scene(2).parts, outer] };
    const lines = sceneText(snap).split('\n');

    expect(lines.slice(5).map((l) => l.match(/^ *\S+/)[0])).toEqual([
      'outer',
      '  merged',
      '    block',
      '    knob',
      '  slot',
    ]);
    expect(lines[6]).toContain('boolean(union)');
    expect(lines[6]).toContain('operand-of=outer operands=[block,knob]');

    const picked = sceneText(snap, { ids: ['knob'] });

    expect(picked).toContain('1 of 3 parts:');
    expect(picked).toContain('    knob "knob"');
    expect(picked).not.toContain('Not in the scene');
  });
});

describe('findInScene', () => {
  it('matches words, group and a region, and sorts by distance with near', () => {
    expect(findInScene(scene(30), { query: 'part 7' })).toContain('1 of 30 parts matched');
    expect(findInScene(scene(30), { group: 'head', region: { min: [0, -2, 0], max: [3, 2, 20] } })).toMatch(
      /^2 of 30 parts matched:\np1 .*\np3 /,
    );

    const near = findInScene(scene(30), { near: { point: [20, 0, 10], radius: 0.1 } }).split('\n');

    expect(near[1]).toMatch(/^p20 /);
    expect(near).toHaveLength(4);
  });
});
