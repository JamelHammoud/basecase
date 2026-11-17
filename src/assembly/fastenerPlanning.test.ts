import { describe, expect, it } from 'vitest';
import { clampingScrews, indexFasteners } from './fastenerIndex';
import { fastenerPlanningFixture, planningMoves, planningScrew } from './fastenerPlanning.fixtures';
import { planRemoval } from './removalOrder';
import { serviceDepths, teardownTo } from './serviceDepth';
import type { ScenePart } from '../types/robotics';

describe('indexed fastener planning', () => {
  it('keeps source order, unique clamping membership and first matching ids without changing the source', () => {
    const chains = [
      planningScrew('first', ['a', 'b', 'a']),
      planningScrew('second', ['b']),
      planningScrew('first', []),
    ];
    const before = structuredClone(chains);
    const index = indexFasteners(chains);

    expect(index.byId.get('first')).toBe(chains[0]);
    expect(index.byPart.get('a')).toEqual([chains[0]]);
    expect(clampingScrews(index, ['missing', 'b', 'a', 'b'])).toEqual(chains.slice(0, 2));
    expect(clampingScrews(indexFasteners([]), ['a'])).toEqual([]);
    expect(chains).toEqual(before);

    chains[0].stack = ['c'];

    expect(indexFasteners(chains).byPart.has('a')).toBe(false);
    expect(indexFasteners(chains).byPart.get('c')).toEqual([chains[0]]);
  });

  it.each([150, 300])('finds the minimum pinned teardown with bounded stack reads at %i parts', (count) => {
    const f = fastenerPlanningFixture(count);
    const selected = teardownTo(f.plan, f.parts.at(-1)!, f.geometry);

    expect(selected).toEqual(new Set([...f.screws, ...f.parts]));
    expect(f.stackReads()).toBeLessThanOrEqual(count * 2);
  });

  it.each([150, 300])('keeps every blocked screw and pinned part with bounded stack reads at %i parts', (count) => {
    const f = fastenerPlanningFixture(count);

    f.parts.forEach((id, i) => {
      f.geometry.moves[id] = planningMoves([[]]);
      f.geometry.drivers[f.screws[i]][0].blockers = [id];
    });

    const plan = planRemoval(f.geometry, {});

    expect(plan.steps).toEqual([]);
    expect(plan.stuckParts).toEqual(f.parts);
    expect(Object.values(plan.screws).every((screw) => screw.verdict === 'stuck')).toBe(true);
    expect(f.stackReads()).toBeLessThanOrEqual(count * 2);
  });

  it.each([300, 600])('stops clearance at the first live blocker in a %i-entry path', (count) => {
    const f = fastenerPlanningFixture(1);
    let reads = 0;
    const blockers = Array.from({ length: count }, () => f.parts[0]);

    blockers.forEach((_, i) => {
      Object.defineProperty(blockers, i, {
        get() {
          reads++;

          return f.parts[0];
        },
      });
    });
    f.geometry.drivers[f.screws[0]][0].blockers = blockers;

    const plan = planRemoval(f.geometry, {});

    expect(reads).toBe(count + 1);
    expect(plan.steps).toEqual([]);
    expect(plan.stuckParts).toEqual(f.parts);
    expect(plan.screws[f.screws[0]]).toEqual({ verdict: 'stuck', blockers: Array(count).fill(f.parts[0]) });

    f.geometry.drivers[f.screws[0]][0].blockers = ['unknown'];

    expect(planRemoval(f.geometry, {}).steps).toEqual([
      { kind: 'screw', ids: f.screws },
      { kind: 'part', ids: f.parts },
    ]);
    expect(plan.stuckParts).toEqual(f.parts);
  });

  it('keeps service dependencies and hosted sleeves in the proven order', () => {
    const f = fastenerPlanningFixture(3);

    f.geometry.chains.sleeves = [{ id: 'washer', kind: 'washer', host: f.parts[2], screw: f.screws[2] }];

    const plan = planRemoval(f.geometry, {});
    const parts = f.parts.map((id) => ({ id, supplyId: 'lipo-3s-2200' }) as ScenePart);
    const service = serviceDepths(parts, f.geometry, () => 'hex-key', plan);

    expect(plan.steps[2]).toEqual({ kind: 'screw', ids: [f.screws[2], 'washer'] });
    expect(service.map((row) => row.steps)).toEqual([2, 3, 4]);
    expect(service[2].partsOut).toEqual([f.parts[1], f.parts[0]]);
    expect(service[2].screwsOut).toEqual([f.screws[2], f.screws[1], f.screws[0]]);
  });

  it('removes a pinned unit with its internal screw and hosted sleeves intact', () => {
    const f = fastenerPlanningFixture(2);

    f.geometry.chains.screws = [planningScrew('internal', f.parts)];
    f.geometry.chains.sleeves = [
      { id: 'washer', kind: 'washer', host: f.parts[0], screw: 'internal' },
      { id: 'insert', kind: 'insert', host: f.parts[1], screw: 'internal' },
    ];
    f.geometry.drivers = { internal: [{ tool: 'straight', blockers: f.parts }] };
    f.parts.forEach((id, i) => {
      f.geometry.moves[id] = planningMoves(Array.from({ length: 6 }, () => [f.parts[1 - i], 'internal']));
    });

    const before = structuredClone(f.geometry);
    const plan = planRemoval(f.geometry, Object.fromEntries(f.parts.map((id) => [id, 'unit'])));

    expect(plan.steps).toEqual([{ kind: 'unit', ids: [f.parts[0], f.parts[1], 'insert', 'internal', 'washer'] }]);
    expect(plan.stuckParts).toEqual([]);
    expect(plan.screws.internal).toEqual({ verdict: 'tool', tool: 'L-key' });
    expect(f.geometry).toEqual(before);

    f.geometry.moves.outside = planningMoves([[f.parts[0]]]);
    f.geometry.chains.screws.push(planningScrew('external', [f.parts[0], 'outside']));
    f.geometry.drivers.external = [{ tool: 'straight', blockers: [f.parts[0], 'outside'] }];

    const pinned = planRemoval(f.geometry, Object.fromEntries(f.parts.map((id) => [id, 'unit'])));

    expect(pinned.steps).toEqual([]);
    expect(pinned.stuckParts).toEqual([...f.parts, 'outside']);
  });
});
