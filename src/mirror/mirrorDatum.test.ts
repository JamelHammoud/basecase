import { describe, expect, it } from 'vitest';
import type { V3 } from '../agent/agentFrame';
import { componentPorts } from '../data/componentPorts';
import { COMPONENTS } from '../data/components';
import type { Port } from '../types/ports';
import { mirrorDatum, type MirrorDatum } from './mirrorDatum';
import type { MirrorAxis } from './plane';

const AXES: MirrorAxis[] = [0, 1, 2];
const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function scannedOffset(ports: Port[], axis: MirrorAxis): number {
  const output = ports.find((p) => p.kind === 'output' && Math.abs(p.axis[axis]) < 0.1);

  if (output) return output.position[axis];

  if (!ports.length) return 0;

  const coordinates = ports.map((p) => p.position[axis]);

  return (Math.min(...coordinates) + Math.max(...coordinates)) / 2;
}

function scannedMismatch(port: Port, ports: Port[]): number {
  const matches = ports.filter((p) => p.kind === port.kind && p.thread === port.thread);
  const errors = matches.map((p) => distance(port.position, p.position) + 10 * distance(port.axis, p.axis));

  return Math.min(Infinity, ...errors);
}

function scannedScore(ports: Port[], axis: MirrorAxis, offset: number): number {
  const asymmetry = ports.reduce((total, port) => {
    const position: V3 = [...port.position];
    const direction: V3 = [...port.axis];

    position[axis] = 2 * offset - position[axis];
    direction[axis] = -direction[axis];

    return total + Math.min(100, scannedMismatch({ ...port, position, axis: direction }, ports));
  }, 0);

  return asymmetry + Math.abs(2 * offset);
}

function scannedDatum(ports: Port[], local: V3): MirrorDatum {
  const candidates = AXES.map((axis) => {
    const offset = scannedOffset(ports, axis);

    return { axis, offset, score: scannedScore(ports, axis, offset), align: Math.abs(local[axis]) };
  });
  const best = Math.min(...candidates.map((candidate) => candidate.score));
  const [pick] = candidates.filter((candidate) => candidate.score <= best + 0.5).sort((a, b) => b.align - a.align);

  return { axis: pick.axis, offset: pick.offset };
}

function portAt(position: V3, axis: V3 = [0, 0, 1]): Port {
  return { name: 'mount', kind: 'face', position, axis };
}

function mixedPorts(seed: number): Port[] {
  const kinds: Port['kind'][] = ['face', 'bore', 'screw', 'output', 'boss', 'hole_circle', 'connector'];
  const threads = [undefined, '', 'M2', 'M3', 'm3', 'M3|face'];

  return Array.from({ length: seed % 29 }, (_, i) => ({
    name: `port-${i % 4}`,
    kind: kinds[(seed + i) % kinds.length],
    thread: threads[(seed * 3 + i * 7) % threads.length],
    position: [Math.sin(seed + i) * 80, ((seed * i) % 37) - 18, Math.cos(seed - i) * 60],
    axis: [Math.sin(i), Math.cos(seed), i % 3 === 0 ? 0 : 1],
  }));
}

function countedPorts(count: number) {
  const reads = { kind: 0, thread: 0 };
  const ports = Array.from({ length: count }, (_, i): Port => ({
    name: `mount-${i}`,
    get kind() {
      reads.kind++;

      return i % 2 === 0 ? 'screw' : 'bore';
    },
    get thread() {
      reads.thread++;

      return `M${i % 12}`;
    },
    position: [i % 17, (i % 11) - 5, (i % 7) * 3],
    axis: [0, 1, 0],
  }));

  return { ports, reads };
}

describe('catalog mirror datum matching', () => {
  it('keeps empty, singleton and tied plane choices', () => {
    expect(mirrorDatum([], [0, 0, 1])).toEqual({ axis: 2, offset: 0 });
    expect(mirrorDatum([], [1, 1, 1])).toEqual({ axis: 0, offset: 0 });
    expect(mirrorDatum([portAt([0, 0, 0])], [0, 1, 0])).toEqual({ axis: 1, offset: 0 });
    expect(mirrorDatum([portAt([0, 0, 0])], [0, 0, -1])).toEqual({ axis: 0, offset: 0 });
  });

  it.each([0.249999, 0.25, 0.250001])('keeps the half-millimeter score tie at %s', (offset) => {
    const expected = offset <= 0.25 ? { axis: 0, offset } : { axis: 1, offset: 0 };

    expect(mirrorDatum([portAt([offset, 0, 0])], [1, 0, 0])).toEqual(expected);
  });

  it('matches full scans for every catalog component and local mirror direction', () => {
    const directions: V3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.2, -0.8, 0.5],
    ];

    for (const component of COMPONENTS) {
      const ports = componentPorts(component.id);
      const before = structuredClone(ports);

      for (const local of directions) expect(mirrorDatum(ports, local)).toEqual(scannedDatum(ports, local));

      expect(ports).toEqual(before);
    }
  });

  it('keeps mixed kinds, exact threads, duplicate names and source order across edits', () => {
    for (let seed = 0; seed < 120; seed++) {
      const ports = mixedPorts(seed);
      const before = structuredClone(ports);
      const local: V3 = [Math.sin(seed), Math.cos(seed), -0.5];

      expect(mirrorDatum(ports, local)).toEqual(scannedDatum(ports, local));
      expect(ports).toEqual(before);
      ports.reverse();
      ports.push(portAt([seed, -seed, 0], [0.099999, 0.1, 0]));
      expect(mirrorDatum(ports, local)).toEqual(scannedDatum(ports, local));
      ports[0].thread = 'M3';
      ports[0].kind = 'output';
      ports[0].position[0] += 5;
      expect(mirrorDatum(ports, local)).toEqual(scannedDatum(ports, local));
      expect(mirrorDatum(before, local)).toEqual(scannedDatum(before, local));
    }
  });

  it.each([300, 600])('prepares compatibility in linear reads for %s ports', (count) => {
    const { ports, reads } = countedPorts(count);
    const local: V3 = [0.2, -0.8, 0.5];
    const expected = scannedDatum(ports, local);

    expect(reads.kind).toBe(3 * count * count + 6 * count);
    reads.kind = 0;
    reads.thread = 0;
    expect(mirrorDatum(ports, local)).toEqual(expected);
    expect(reads.kind).toBeLessThanOrEqual(8 * count);
    expect(reads.thread).toBeLessThanOrEqual(5 * count);
  });
});
