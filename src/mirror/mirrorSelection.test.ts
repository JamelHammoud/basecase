import { describe, expect, it, vi } from 'vitest';
import { portsOf, worldPort } from '../agent/ports';
import { box } from '../sim/fixtures/parts';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { localMirrorAxis, mirrorDatum } from './mirrorDatum';
import { matchingPort, type PortMatch } from './mirrorMates';
import { symmetricAxis } from './mirrorPart';
import { reflectPoint, type MirrorAxis, type MirrorPlane, type V3 } from './plane';

const AXES: MirrorAxis[] = [0, 1, 2];
const gap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const portAt = (name: string, x: number, kind: Port['kind'] = 'face'): Port => ({
  name,
  kind,
  position: [x, 0, 0],
  axis: [0, 0, 1],
});

function partWithPorts(id: string, ports: Port[], rotation: V3 = [0, 0, 0]): ScenePart {
  return {
    ...box(id, [0, 0, 0], [20, 20, 20], 10),
    kind: 'cad_part',
    rotation,
    cad: {
      language: 'openscad',
      code: 'cube(20);',
      positions: [],
      indices: [],
      originOffset: [0, 0, 0],
      baseSize: [20, 20, 20],
      ports,
    },
  };
}

function sortedMatch({ source, name, onto, plane }: PortMatch): string | undefined {
  const port = portsOf(source).find((candidate) => candidate.name === name);

  if (!port) return undefined;

  const want = reflectPoint(worldPort(source, port).position, plane);
  const [best] = portsOf(onto)
    .filter((candidate) => candidate.kind === port.kind)
    .map((candidate) => ({ name: candidate.name, off: gap(worldPort(onto, candidate).position, want) }))
    .sort((a, b) => a.off - b.off);

  return best && best.off <= 1 ? best.name : undefined;
}

function sortedAxis(axes: MirrorAxis[], rotation: V3, axis: MirrorAxis): MirrorAxis {
  if (axes.includes(axis)) return axis;

  const local = localMirrorAxis(rotation, axis);

  return [...axes].sort((a, b) => Math.abs(local[b]) - Math.abs(local[a]))[0];
}

function generatedPorts(seed: number): Port[] {
  const kinds: Port['kind'][] = ['face', 'bore', 'screw', 'output', 'boss', 'hole_circle', 'connector'];

  return Array.from({ length: seed % 31 }, (_, i) => ({
    name: `port-${i % 7}`,
    kind: kinds[(seed + i) % kinds.length],
    position: [Math.sin(seed + i), Math.cos(seed - i), (i % 5) / 2],
    axis: [0, 0, 1],
  }));
}

function checkAxisChoices(axes: MirrorAxis[]) {
  for (let seed = 0; seed < 40; seed++) {
    const rotation: V3 = [seed * 9, seed * 3, seed * -7];

    for (const axis of AXES) expect(symmetricAxis(axes, rotation, axis)).toBe(sortedAxis(axes, rotation, axis));
  }
}

describe('Mirror candidate selection', () => {
  it('keeps mate kinds, first ties, missing names and the inclusive millimeter limit', () => {
    const source = partWithPorts('source', [portAt('mount', 0), portAt('mount', 20)]);
    const onto = partWithPorts('target', [portAt('wrong-kind', 0, 'bore'), portAt('first', 1), portAt('second', -1)]);
    const match: PortMatch = { source, name: 'mount', onto, plane: { axis: 0, offset: 0 } };

    expect(matchingPort(match)).toBe('first');
    expect(matchingPort({ ...match, name: 'missing' })).toBeUndefined();
    expect(matchingPort({ ...match, onto: partWithPorts('empty', []) })).toBeUndefined();

    for (const x of [0.999999, 1, 1.000001]) {
      const target = partWithPorts('target', [portAt('limit', x)]);

      expect(matchingPort({ ...match, onto: target })).toBe(x <= 1 ? 'limit' : undefined);
    }
  });

  it('matches sorted mate selection across transformed, reordered and edited ports', () => {
    for (let seed = 0; seed < 120; seed++) {
      const source = partWithPorts('source', generatedPorts(seed), [seed, -seed / 3, seed / 2]);
      const onto = partWithPorts('target', generatedPorts(seed + 11), [-seed, seed / 2, seed]);
      const before = structuredClone({ source, onto });

      for (const axis of AXES) {
        const plane: MirrorPlane = { axis, offset: Math.sin(seed) / 3 };

        for (const name of ['port-0', 'port-3', 'port-6', 'missing']) {
          const match = { source, name, onto, plane };

          expect(matchingPort(match)).toBe(sortedMatch(match));
        }
      }

      expect({ source, onto }).toEqual(before);
      onto.cad!.ports!.reverse();
      onto.cad!.ports!.push(portAt('new', 0));
      onto.position[0] += 0.5;
      onto.rotation[2] += 30;

      const match: PortMatch = { source, name: 'port-0', onto, plane: { axis: 2, offset: 0.25 } };

      expect(matchingPort(match)).toBe(sortedMatch(match));
    }
  });

  it('keeps axis order, direct-axis preference and rotated alignment for every symmetry subset', () => {
    for (let subset = 1; subset < 8; subset++) {
      const axes = AXES.filter((axis) => subset & (1 << axis));

      for (const order of [axes, axes.toReversed()]) checkAxisChoices(order);

      expect(axes).toEqual(AXES.filter((axis) => subset & (1 << axis)));
    }

    expect(symmetricAxis([2, 0], [0, 0, 0], 1)).toBe(2);
    expect(symmetricAxis([0, 2], [0, 0, 0], 1)).toBe(0);
  });

  it.each([300, 600])('selects all Mirror candidates without sorting for %s mate ports', (count) => {
    const source = partWithPorts('source', [portAt('mount', 0)]);
    const onto = partWithPorts(
      'target',
      Array.from({ length: count }, (_, i) => portAt(`mount-${i}`, count - i - 1)),
    );
    const match: PortMatch = { source, name: 'mount', onto, plane: { axis: 0, offset: 0 } };
    const sort = vi.spyOn(Array.prototype, 'sort');
    let calls: number;
    let port: string | undefined;
    let axis: MirrorAxis;
    let datum: ReturnType<typeof mirrorDatum>;

    try {
      port = matchingPort(match);
      axis = symmetricAxis([0, 2], [20, 30, 40], 1);
      datum = mirrorDatum([], [0, 0, 1]);
      calls = sort.mock.calls.length;
    } finally {
      sort.mockRestore();
    }

    expect(port).toBe(`mount-${count - 1}`);
    expect(axis).toBe(sortedAxis([0, 2], [20, 30, 40], 1));
    expect(datum).toEqual({ axis: 2, offset: 0 });
    expect(calls).toBe(0);
  });
});
