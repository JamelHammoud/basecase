import { describe, expect, it } from 'vitest';
import type { CadAudit } from '../types/cadAudit';
import type { ScenePart } from '../types/robotics';
import { editDistance } from '../../electron/editDistance.mjs';
import { nearestIds, partCode, partRecord } from './agentPartRecord';
import { specToPart } from './agentScene';

const audit: CadAudit = { bodies: 1, genus: 2, nonManifoldEdges: 0, openEdges: 0, hullVolume: 9000 };

const cadPart = (id: string, name: string) =>
  specToPart({
    id,
    name,
    shape: 'cad_part',
    cad: {
      language: 'openscad',
      code: 'cube(10);',
      positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 10],
      indices: [0, 1, 2, 0, 2, 3],
      stats: { volume: 1000 },
      audit,
      expect: { genus: 2 },
      ports: [{ name: 'top', position: [5, 5, 10], axis: [0, 0, 1], kind: 'face', check: 'ok' }],
    },
  });

function previousNearest(parts: ScenePart[], wanted: string) {
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const query = wanted.toLowerCase();

  return parts
    .map((part) => {
      const id = part.id.toLowerCase();
      const shared = words(query).filter((word) => words(`${part.id} ${part.name}`).includes(word)).length;
      const contains = id.includes(query) || query.includes(id) ? 2 : 0;

      return {
        id: part.id,
        score: editDistance(query, id) / Math.max(query.length, id.length, 1) - shared * 0.25 - contains * 0.25,
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((part) => part.id);
}

describe('part records', () => {
  const parts = [cadPart('left-shoulder-yoke', 'Left Shoulder Yoke'), cadPart('left-thigh', 'Left Thigh')];

  it('keeps the audit, requirements and ports on the part', () => {
    expect(partRecord(parts, 'left-thigh')).toEqual({ exists: true, volume: 1000, audit, expect: { genus: 2 } });
    expect(parts[0].cad?.ports?.[0].name).toBe('top');
    expect(partRecord(parts, 'nope')).toEqual({ exists: false });
  });

  it('returns plain code, and suggests the closest ids for a guessed one', () => {
    expect(partCode(parts, 'left-thigh')).toEqual({ text: 'left-thigh (openscad):\ncube(10);' });
    expect(partCode(parts, 'shoulder-yoke-left').error).toMatch(/Closest CAD parts: left-shoulder-yoke, left-thigh\.$/);
  });

  it('preserves suggestion rankings for repeated words, punctuation, ties and empty queries', () => {
    const candidates = Array.from({ length: 40 }, (_, i) =>
      cadPart(`Arm-${i % 7}-${i}`, `${i % 2 ? 'Left' : 'Right'} arm plate ${i % 3}`),
    );
    const original = structuredClone(candidates);

    for (const query of ['', '---', 'ARM arm plate', 'Left_ARM-plate-2', 'arm-4', 'é腕', 'unknown-id']) {
      expect(nearestIds(candidates, query)).toEqual(previousNearest(candidates, query));
      expect(nearestIds(candidates, query, (part) => part.name.startsWith('Left'))).toEqual(
        previousNearest(
          candidates.filter((part) => part.name.startsWith('Left')),
          query,
        ),
      );
    }

    expect(candidates).toEqual(original);
    expect(nearestIds([], 'arm')).toEqual([]);
    expect(nearestIds(candidates, 'arm', () => false)).toEqual([]);
  });

  it('reads current names once per candidate and observes later edits', () => {
    const candidates = Array.from({ length: 100 }, (_, i) => cadPart(`part-${i}`, 'arm plate mount'));
    let nameReads = 0;

    for (const part of candidates) {
      Object.defineProperty(part, 'name', {
        configurable: true,
        get: () => {
          nameReads++;

          return 'arm plate mount';
        },
      });
    }

    const query = 'left arm plate mount missing';
    const expected = previousNearest(candidates, query);

    expect(nameReads).toBe(500);

    nameReads = 0;
    expect(nearestIds(candidates, query)).toEqual(expected);
    expect(nameReads).toBe(100);

    Object.defineProperty(candidates[99], 'name', { value: query });
    expect(nearestIds(candidates, query)).toEqual(previousNearest(candidates, query));
    expect(nearestIds(candidates, query)[0]).toBe('part-99');
  });
});
