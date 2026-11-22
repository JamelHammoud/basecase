import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { parseCase, touchTheDots } from '../testing';
import { addLine, addZone, clearRegions } from './regionEdits';
import { checkedConsole, editableConsole } from './consoleEdits';
import { signalShape } from './signalNames';
import type { CaseConsole } from './format';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const base = () => parseCase(touchTheDots(arm));
const scope = { declared: new Set<string>(), probes: new Set<string>(), inputs: new Set<string>() };

const square: [number, number][] = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
];

function saved(console: CaseConsole) {
  const checked = checkedConsole(base(), console);

  if (!checked.ok) throw new Error(checked.problem);

  return checked.kase;
}

describe('zones and lines saved with a Case', () => {
  it('survive a save and reopen with their names, points, labels and order', () => {
    const edited = addZone(addLine(editableConsole(undefined), 'front', [0.5, 1], [0.5, 0]), 'front', square);
    const withLabel = {
      ...edited,
      regions: {
        ...edited.regions,
        front: { ...edited.regions!.front, lines: [{ ...edited.regions!.front.lines[0], label: 'block' }] },
      },
    };
    const kase = saved(withLabel);
    const reopened = parseCase(JSON.parse(JSON.stringify(kase)));

    expect(reopened.console?.regions).toEqual(kase.console?.regions);
    expect(reopened.console?.regions?.front.lines[0]).toEqual({
      name: 'line1',
      from: [0.5, 1],
      to: [0.5, 0],
      label: 'block',
    });
    expect(reopened.console?.regions?.front.zones[0].name).toBe('zone1');
  });

  it('keep two cameras apart even when their lines share a name', () => {
    const edited = addLine(
      addLine(editableConsole(undefined), 'left', [0, 0.5], [1, 0.5]),
      'right',
      [0.5, 0],
      [0.5, 1],
    );
    const regions = saved(edited).console!.regions!;

    expect(regions.left.lines[0].name).toBe(regions.right.lines[0].name);
    expect(regions.left.lines[0].from).not.toEqual(regions.right.lines[0].from);
  });

  it('name each new drawing after the ones already there and drop empty cameras', () => {
    let console = editableConsole(undefined);

    console = addLine(addLine(console, 'front', [0, 0.5], [1, 0.5]), 'front', [0.5, 0], [0.5, 1]);
    expect(console.regions!.front.lines.map((line) => line.name)).toEqual(['line1', 'line2']);

    expect(clearRegions(console, 'front').regions).toBeUndefined();
  });

  it.each([
    ['a line with no length', { front: { lines: [{ name: 'a', from: [0.5, 0.5], to: [0.5, 0.5] }] } }],
    [
      'a zone of two points',
      {
        front: {
          zones: [
            {
              name: 'a',
              points: [
                [0, 0],
                [1, 1],
              ],
            },
          ],
        },
      },
    ],
    ['a point outside the picture', { front: { lines: [{ name: 'a', from: [0, 0], to: [2, 1] }] } }],
    ['a name with a dot', { front: { lines: [{ name: 'a.b', from: [0, 0], to: [1, 1] }] } }],
    [
      'a repeated name',
      {
        front: {
          lines: [
            { name: 'a', from: [0, 0], to: [1, 1] },
            { name: 'A', from: [0, 1], to: [1, 0] },
          ],
        },
      },
    ],
    ['a camera name with a dot', { 'a.b': { lines: [{ name: 'a', from: [0, 0], to: [1, 1] }] } }],
  ])('refuse %s', (_name, regions) => {
    const checked = checkedConsole(base(), { ...editableConsole(undefined), regions } as unknown as CaseConsole);

    expect(checked.ok).toBe(false);
  });

  it('refuse more than 16 zones and more than 8 cameras', () => {
    const zones = Array.from({ length: 17 }, (_, i) => ({ name: `z${i}`, points: square }));
    const cameras = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`c${i}`, { lines: [{ name: 'a', from: [0, 0], to: [1, 1] }] }]),
    );

    expect(checkedConsole(base(), { ...editableConsole(undefined), regions: { front: { zones } } } as never).ok).toBe(
      false,
    );
    expect(checkedConsole(base(), { ...editableConsole(undefined), regions: cameras } as never).ok).toBe(false);
  });
});

describe('tracking signal names', () => {
  it.each([
    'vision.front.block.tracks',
    'vision.front.zone.bin.count',
    'vision.front.zone.bin.dwell',
    'vision.front.line.gate.in',
    'vision.front.line.gate.out',
    'vision.front.block.score',
    'vision.front.block',
    'vision.*.line.gate.in',
  ])('accepts %s as a number', (name) => {
    expect(signalShape(name, scope)).toBe('number');
  });

  it.each(['vision.front', 'vision.front.zone.bin', 'vision.front.zone.bin.in', 'vision.front.line.gate.count'])(
    'refuses %s',
    (name) => {
      expect(signalShape(name, scope)).not.toBe('number');
    },
  );
});
