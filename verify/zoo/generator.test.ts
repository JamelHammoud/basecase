import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { ZOO_BODY_IDS } from './bodies';
import {
  generatePair,
  PoserPool,
  SAMPLE_DEFORMABLE,
  SAMPLE_INFEASIBLE,
  SAMPLE_SIZE,
  stratifiedSample,
  zooGrid,
  type ZooPair,
} from './generator';
import { freshSeed } from './rng';
import { ZOO_TASKS } from './tasks';

const count = (pairs: Array<{ expect: string }>, kind: string) => pairs.filter((p) => p.expect === kind).length;

describe('the AnythingZoo generator', () => {
  it('lays out 30 tasks on 6 bodies', () => {
    const grid = zooGrid();

    expect(ZOO_TASKS).toHaveLength(30);
    expect(ZOO_BODY_IDS).toHaveLength(6);
    expect(grid).toHaveLength(180);
    expect(count(grid, 'feasible')).toBe(81);
    expect(count(grid, 'deformable')).toBe(18);
  });

  it('draws a valid hidden judge and labelled rollouts for every pair, fresh each seed', async () => {
    const mj = await loadMujoco();
    const seed = freshSeed();
    const again = freshSeed();
    const broken: string[] = [];
    const pairs: ZooPair[] = [];
    const pool = new PoserPool(mj);

    for (const ref of zooGrid()) {
      try {
        pairs.push(await generatePair(mj, seed, ref, pool));
      } catch (error) {
        broken.push(`${ref.task}@${ref.body}: ${(error as Error).message.split(' (')[0]}`);
      }
    }

    expect(broken).toEqual([]);

    const feasible = pairs.filter((p) => p.expect === 'feasible');
    const other = await generatePair(mj, again, feasible[0], pool);

    pool.dispose();

    expect(feasible.every((p) => p.hidden && p.rollouts.some((r) => r.pass) && p.rollouts.some((r) => !r.pass))).toBe(
      true,
    );
    expect(pairs.every((p) => p.prompt.length > 10 && !p.prompt.includes('{'))).toBe(true);
    expect(feasible.flatMap((p) => Object.values(p.hidden!.signals)).filter((s) => s.kind === 'contact')).toEqual([]);
    expect(
      other.prompt === feasible[0].prompt && JSON.stringify(other.hidden) === JSON.stringify(feasible[0].hidden),
    ).toBe(false);
  }, 1_800_000);

  it('samples 20 pairs stratified by body, with refusals and deformables as controls', () => {
    const seed = freshSeed();
    const sample = stratifiedSample(seed);
    const bodies = new Set(sample.filter((p) => p.expect === 'feasible').map((p) => p.body));
    const families = new Set(sample.map((p) => p.family));

    expect(sample).toHaveLength(SAMPLE_SIZE);
    expect(new Set(sample.map((p) => `${p.task}@${p.body}`)).size).toBe(SAMPLE_SIZE);
    expect(count(sample, 'infeasible')).toBe(SAMPLE_INFEASIBLE);
    expect(count(sample, 'deformable')).toBe(SAMPLE_DEFORMABLE);
    expect(bodies.size).toBe(ZOO_BODY_IDS.length);
    expect(families).toEqual(new Set(['move', 'pose', 'arm', 'soft']));
    expect(stratifiedSample(seed)).toEqual(sample);
  });
});
