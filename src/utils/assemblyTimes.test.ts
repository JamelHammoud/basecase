import { describe, expect, it } from 'vitest';
import { isFastener, isInsert } from '../guide/guideItems';
import { isBuilt } from '../guide/guidePlan';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { assemblyTimes, TIME_MINUTES } from './engineeringTime';

function previousTimes(parts: ScenePart[], steps: string[][]) {
  const byId = new Map(parts.filter(isBuilt).map((p) => [p.id, p]));
  const counted = new Set<string>();

  return steps.map((ids, index) => {
    const fresh = ids.filter((id) => byId.has(id) && !counted.has(id)).map((id) => byId.get(id)!);

    fresh.forEach((p) => counted.add(p.id));

    const fasteners = fresh.filter(isFastener).length;
    const inserts = fresh.filter(isInsert).length;
    const pieces = fresh.length - fasteners - inserts;

    return {
      step: index + 1,
      minutes:
        TIME_MINUTES.step +
        pieces * TIME_MINUTES.part +
        fasteners * TIME_MINUTES.fastener +
        inserts * TIME_MINUTES.insert,
      fasteners,
      inserts,
      ids: fresh.map((p) => p.id),
    };
  });
}

const base = fixtureRobots()[0].parts[0];
const parts: ScenePart[] = [
  { ...base, id: 'body', kind: 'box', visible: true, role: 'solid' },
  {
    ...base,
    id: 'screw',
    kind: 'hardware',
    hardware: { type: 'socket_head', size: 'M3', length: 6 },
    visible: true,
    role: 'solid',
  },
  {
    ...base,
    id: 'insert',
    kind: 'hardware',
    hardware: { type: 'heat_insert', size: 'M3', length: 6 },
    visible: true,
    role: 'solid',
  },
  { ...base, id: 'hidden', visible: false },
  { ...base, id: 'reference', role: 'reference' },
  { ...base, id: 'axis', kind: 'pivot_axis' },
];

describe('assembly time tally', () => {
  it('preserves complete estimates through mixed steps, repeats, exclusions and later edits', () => {
    const ids = [...parts.map((part) => part.id), 'missing'];

    for (let seed = 0; seed < 160; seed++) {
      const steps = Array.from({ length: seed % 11 }, (_, step) =>
        Array.from({ length: (seed + step * 3) % 17 }, (_, i) => ids[(seed + step + i * 5) % ids.length]),
      );
      const before = structuredClone({ parts, steps });
      const result = assemblyTimes(parts, DEFAULT_PROJECT, steps);

      expect(result).toEqual(previousTimes(parts, steps));
      expect({ parts, steps }).toEqual(before);

      const edited = parts.map((part, i) => ({ ...part, visible: (seed + i) % 3 !== 0 }));

      expect(assemblyTimes(edited, DEFAULT_PROJECT, steps)).toEqual(previousTimes(edited, steps));
      expect(result).toEqual(previousTimes(parts, steps));
    }
  });

  it('keeps within-step duplicates and charges only the step allowance for later repeats', () => {
    const steps = [['body', 'screw', 'insert', 'screw'], ['insert', 'body', 'missing'], []];

    expect(assemblyTimes(parts, DEFAULT_PROJECT, steps)).toEqual([
      { step: 1, minutes: 5.5, fasteners: 2, inserts: 1, ids: steps[0] },
      { step: 2, minutes: 1, fasteners: 0, inserts: 0, ids: [] },
      { step: 3, minutes: 1, fasteners: 0, inserts: 0, ids: [] },
    ]);
  });
});
