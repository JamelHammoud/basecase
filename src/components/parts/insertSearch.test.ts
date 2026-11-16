import { describe, expect, it, vi } from 'vitest';
import { searchInsertables, type Hit } from './insertSearch';
import { robotEntries } from './robotEntries';

const first = (query: string) => searchInsertables(query, { sourced: [] })[0];

const sectionOf = (hit: Hit) => {
  if (hit.kind === 'robot') return 'Robots';

  if (hit.kind === 'objects') return 'Objects';

  return hit.item.hardware ? 'Hardware' : 'Components';
};

const label = (hit: Hit) => {
  if (hit.kind === 'robot') return hit.robot.preset.title;

  return hit.kind === 'objects' ? hit.category.title : hit.item.name;
};

describe('one search for everything a scene holds', () => {
  it('lists the SO-101 robot before the parts named after it', () => {
    const hits = searchInsertables('so-101', { sourced: [] });

    expect(label(hits[0])).toBe('SO-101 Arm');
    expect(hits.some((h) => h.kind === 'part')).toBe(true);
  });

  it('lists servos first for "servo"', () => {
    const hit = first('servo');

    expect(sectionOf(hit)).toBe('Components');
    expect(hit.kind === 'part' && hit.item.componentId).toBeTruthy();
  });

  it('keeps a sized query exact hardware', () => {
    const hits = searchInsertables('m3x12', { sourced: [] });

    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.every((h) => h.kind === 'part' && h.item.hardware?.size === 'M3' && h.item.hardware.length === 12),
    ).toBe(true);
  });

  it('routes a word that names a section to that section', () => {
    for (const [query, section] of [
      ['robot', 'Robots'],
      ['quadruped', 'Robots'],
      ['arms', 'Robots'],
      ['mug', 'Objects'],
      ['kitchen', 'Objects'],
      ['servo', 'Components'],
      ['washer', 'Hardware'],
    ] as const) {
      expect(sectionOf(first(query))).toBe(section);
    }

    expect(label(first('mug'))).toBe('Kitchen');
    expect(searchInsertables('screw', { sourced: [] }).some((h) => h.kind === 'objects')).toBe(false);
  });

  it('finds imported robots by name and source', () => {
    const robots = robotEntries([
      { url: 'https://github.com/me/desk-arm', name: 'Desk Arm', joints: 2, thumbnail: '', importedAt: '' },
    ]);
    const hit = searchInsertables('desk arm', { sourced: [], robots })[0];

    expect(hit.kind === 'robot' && hit.robot.group).toBe('Imported');
    expect(label(searchInsertables('github.com/me', { sourced: [], robots })[0])).toBe('Desk Arm');
    expect(searchInsertables('   ', { sourced: [], robots })).toEqual([]);
  });

  it('reads each immutable robot once across queries and accepts replacement entries', () => {
    const [robot] = robotEntries([
      { url: 'https://github.com/me/desk-arm', name: 'Desk Arm', joints: 2, thumbnail: '', importedAt: '' },
    ]);
    const title = vi.fn(() => 'Zephyra Arm');
    const indexed = {
      ...robot,
      preset: {
        ...robot.preset,
        get title() {
          return title();
        },
      },
    };
    const sources = { sourced: [], robots: [indexed] };

    for (const query of ['zephyra', 'zephyra arm', 'github.com/me', 'arm', 'no-such-robot']) {
      const hits = searchInsertables(query, sources);

      expect(hits.some((hit) => hit.kind === 'robot' && hit.robot === indexed)).toBe(query !== 'no-such-robot');
    }

    expect(title).toHaveBeenCalledTimes(1);

    const replacement = { ...indexed, preset: { ...robot.preset, title: 'Bench Manipulator' } };
    const replaced = { sourced: [], robots: [replacement] };

    expect(searchInsertables('zephyra', replaced)).toEqual([]);
    expect(searchInsertables('bench', replaced)).toEqual([{ kind: 'robot', robot: replacement }]);
  });

  it('keeps current input order for tied robots after warming the indices', () => {
    const robots = robotEntries([
      { url: 'https://github.com/me/first', name: 'Desk Arm', joints: 2, thumbnail: '', importedAt: '' },
      { url: 'https://github.com/me/second', name: 'Desk Arm', joints: 2, thumbnail: '', importedAt: '' },
    ]).slice(0, 2);

    expect(searchInsertables('desk arm', { sourced: [], robots })).toEqual(
      robots.map((robot) => ({ kind: 'robot', robot })),
    );
    expect(searchInsertables('desk arm', { sourced: [], robots: robots.toReversed() })).toEqual(
      robots.toReversed().map((robot) => ({ kind: 'robot', robot })),
    );
  });
});
