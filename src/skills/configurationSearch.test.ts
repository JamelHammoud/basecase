import { expect, it } from 'vitest';
import { searchConfigurations, type ConfigurationProblem } from './configurationSearch';

const problem = (): ConfigurationProblem => ({
  start: [-1, 0],
  goal: [1, 0],
  joints: [0, 1].map(() => ({ range: [-2, 2], continuous: false, travelM: 1 })),
  clear: ([x, y]) => Math.abs(x) > 0.2 || Math.abs(y) > 0.6,
  seed: 1812,
  stop: () => false,
});

it('searches reproducibly around a blocked direct transition and independently checks every edge', async () => {
  const a = await searchConfigurations(problem());
  const b = await searchConfigurations(problem());

  expect(a).toEqual(b);
  expect(a.status).toBe('found');
  expect(a.path[0]).toEqual([-1, 0]);
  expect(a.path.at(-1)).toEqual([1, 0]);

  for (let i = 1; i < a.path.length; i++) {
    const from = a.path[i - 1];
    const to = a.path[i];

    for (let k = 0; k <= 1000; k++) {
      const q = from.map((v, j) => v + ((to[j] - v) * k) / 1000);

      expect(problem().clear(q)).toBe(true);
    }
  }
});

it('retains the direct fast path and checks between clear endpoints', async () => {
  const direct = await searchConfigurations({ ...problem(), clear: () => true });
  const enclosed = await searchConfigurations({ ...problem(), clear: ([x]) => Math.abs(x) > 0.2, budget: 400 });

  expect(direct.path).toEqual([
    [-1, 0],
    [1, 0],
  ]);
  expect(direct.nodes).toBe(0);
  expect(enclosed.status).toBe('budget');
  expect(enclosed.checks).toBeLessThanOrEqual(400);
  expect(enclosed.path).toEqual([]);
});

it('rejects a colliding start and out-of-range goals', async () => {
  expect((await searchConfigurations({ ...problem(), start: [0, 0] })).status).toBe('start');
  expect((await searchConfigurations({ ...problem(), goal: [3, 0] })).status).toBe('limits');
});

it('wraps only continuous joints and emits an unwrapped short transition', async () => {
  const input: ConfigurationProblem = {
    ...problem(),
    start: [Math.PI - 0.1],
    goal: [-Math.PI + 0.1],
    joints: [{ range: [-Math.PI, Math.PI], continuous: true, travelM: 0.1 }],
    clear: ([q]) => Math.abs(Math.sin(q)) < 0.2,
  };
  const continuous = await searchConfigurations(input);
  const limited = await searchConfigurations({ ...input, joints: [{ ...input.joints[0], continuous: false }] });

  expect(continuous.status).toBe('found');
  expect(continuous.path.at(-1)![0] - continuous.path[0][0]).toBeCloseTo(0.2);
  expect(limited.status).toBe('budget');
});

it('yields for cancellation during direct edge checking', async () => {
  let stopped = false;
  const pending = searchConfigurations({ ...problem(), clear: () => true, stop: () => stopped });

  stopped = true;

  const result = await pending;

  expect(result.status).toBe('cancelled');
  expect(result.path).toEqual([]);
  expect(result.checks).toBeLessThan(256);
});
