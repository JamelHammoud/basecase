import { describe, expect, it } from 'vitest';
import { part } from '../utils/engineering.fixtures';
import type { FixedMate } from '../utils/robotImport/simready';
import { withFixedMates } from './fixedMates';

const linked = (id: string, link = id) =>
  part(id, { robotLink: { robot: 'assembly', link, version: 1, onshape: [`occurrence-${id}`] } });

describe('fixed mate attachment', () => {
  it('keeps exact link matching, source order, duplicate names and unrelated part identity', () => {
    const parts = [linked('Arm'), part('loose'), linked('arm'), linked('__proto__'), linked('missing')];
    const mates = [
      { link: 'Arm', name: 'Wrist slide' },
      { link: 'arm', name: 'Lower ball' },
      { link: 'Arm', name: 'Elbow ball' },
      { link: 'other', name: 'Unused' },
      { link: '__proto__', name: 'Base planar' },
      { link: 'Arm', name: 'Elbow ball' },
    ];
    const before = structuredClone({ parts, mates });
    const out = withFixedMates(parts, mates);

    expect(out.map((p) => p.id)).toEqual(parts.map((p) => p.id));
    expect(out.map((p) => p.robotLink?.fixedMates)).toEqual([
      ['Wrist slide', 'Elbow ball', 'Elbow ball'],
      undefined,
      ['Lower ball'],
      ['Base planar'],
      undefined,
    ]);
    expect(out[0].robotLink).toEqual({ ...parts[0].robotLink, fixedMates: out[0].robotLink?.fixedMates });
    expect(out[1]).toBe(parts[1]);
    expect(out[4]).toBe(parts[4]);
    expect({ parts, mates }).toEqual(before);
  });

  it('gives repeated links independent note arrays and rebuilds them after source edits', () => {
    const parts = [linked('first', 'Arm'), linked('second', 'Arm')];
    const mates = [{ link: 'Arm', name: 'Elbow ball' }];
    const first = withFixedMates(parts, mates);

    first[0].robotLink!.fixedMates!.push('Local note');
    expect(first[1].robotLink?.fixedMates).toEqual(['Elbow ball']);
    expect(parts[0].robotLink?.fixedMates).toBeUndefined();
    mates[0].name = 'Wrist slide';

    const second = withFixedMates(parts, mates);

    expect(second.map((p) => p.robotLink?.fixedMates)).toEqual([['Wrist slide'], ['Wrist slide']]);
    expect(first[1].robotLink?.fixedMates).toEqual(['Elbow ball']);
  });

  it('preserves existing notes when no new mate matches and replaces them when one does', () => {
    const p = linked('Arm');

    p.robotLink!.fixedMates = ['Previous'];
    expect(withFixedMates([p])[0]).toBe(p);
    expect(withFixedMates([p], [{ link: 'other', name: 'Unused' }])[0]).toBe(p);
    expect(withFixedMates([p], [{ link: 'Arm', name: 'Current' }])[0].robotLink?.fixedMates).toEqual(['Current']);
    expect(p.robotLink?.fixedMates).toEqual(['Previous']);
    expect(withFixedMates([], [{ link: 'Arm', name: 'Unused' }])).toEqual([]);
  });

  it.each([300, 600])('reads mate links in linear work for %i parts', (size) => {
    let linkReads = 0;
    const parts = Array.from({ length: size }, (_, i) => linked(`link-${i}`));
    const mates: FixedMate[] = Array.from({ length: size }, (_, i) => ({
      get link() {
        linkReads++;

        return `link-${i}`;
      },
      name: `Mate ${i}`,
    }));
    const out = withFixedMates(parts, mates);

    expect(linkReads).toBeLessThanOrEqual(size * 2);
    expect(out.map((p) => p.robotLink?.fixedMates)).toEqual(mates.map((m) => [m.name]));
  });
});
