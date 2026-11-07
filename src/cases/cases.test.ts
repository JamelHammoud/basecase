import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { evaluateLocally, type Contract, type Trace } from './contract';
import { parseCase, runCase, touchTheDots } from './testing';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;
const above = (value: number) => ({ atom: { expr: { signal: 'x' }, cmp: '>' as const, value, scale: 1 } });
const contract = (success: Contract['success']): Contract => ({ version: 1, success, failures: [] });
const trace = (values: number[], dt = 0.1): Trace => ({ dt, signals: { x: values } });

describe('Case files', () => {
  it('round-trip through the validator', () => {
    const kase = touchTheDots(robot('arm-3dof'));

    expect(parseCase(JSON.parse(JSON.stringify(kase)))).toEqual(JSON.parse(JSON.stringify(kase)));
  });

  it('refuse hostile values', () => {
    const kase = JSON.parse(JSON.stringify(touchTheDots(robot('arm-3dof'))));

    expect(() => parseCase({ ...kase, id: '../../etc/passwd' })).toThrow();
    expect(() => parseCase({ ...kase, task: { ...kase.task, seconds: 1e9 } })).toThrow();
    expect(() => parseCase({ ...kase, world: { objects: [...kase.world.objects, kase.world.objects[0]] } })).toThrow(
      /repeats/,
    );
    expect(() =>
      parseCase({ ...kase, world: { objects: Array.from({ length: 9999 }, () => kase.world.objects[0]) } }),
    ).toThrow();
    expect(() => parseCase({ ...kase, reference: { timeline: [{ at: NaN }] } })).toThrow();
  });
});

describe('the local contract evaluator', () => {
  it('matches the shared contract semantics', async () => {
    const eventually = contract({ eventually: { window: 'whole', state: above(1) } });
    const always = contract({ always: { window: 'whole', state: above(1) } });
    const hold = contract({ hold_for: { seconds: 0.3, state: above(0), within: 'whole' } });
    const sequence = contract({
      sequence: [
        { eventually: { window: 'whole', state: above(5) } },
        { eventually: { window: 'whole', state: { not: above(1) } } },
      ],
    });

    expect((await evaluateLocally(eventually, trace([0, 2, 0]))).passed).toBe(true);
    expect((await evaluateLocally(always, trace([2, 2, 0.5, 2]))).margin).toBeCloseTo(-0.5);
    expect((await evaluateLocally(hold, trace([1, 1, -1, 1, 1]))).passed).toBe(false);
    expect((await evaluateLocally(hold, trace([1, 1, 1, -1, 1]))).passed).toBe(true);
    expect((await evaluateLocally(sequence, trace([0, 6, 0]))).passed).toBe(true);
    expect((await evaluateLocally(sequence, trace([0, 0, 6]))).passed).toBe(false);
  });

  it('rejects unknown signals and NaN traces instead of passing', async () => {
    const unknown = contract({
      eventually: { window: 'whole', state: { atom: { expr: { signal: 'y' }, cmp: '>', value: 0, scale: 1 } } },
    });

    await expect(evaluateLocally(unknown, trace([1]))).rejects.toThrow();
    await expect(
      evaluateLocally(contract({ eventually: { window: 'whole', state: above(0) } }), trace([NaN])),
    ).rejects.toThrow();
  });
});

describe('one Case on two arms', () => {
  it('scales the dots to reach, so a Case made on one arm runs on another', async () => {
    const mj = await loadMujoco();
    const kase = touchTheDots(robot('arm-3dof'));
    const limp = await runCase(mj, kase, robot('arm-6dof'), { controller: 'limp' });
    const moved = await runCase(mj, kase, robot('arm-6dof'), { controller: 'reference' });

    expect(limp.passed).toBe(false);
    expect(moved.passed).toBe(true);
    expect(moved.margin).toBeGreaterThan(0);
    expect(moved.case.world.objects[0].size[0]).toBeGreaterThan(kase.world.objects[0].size[0]);
  });

  it('a marker never collides, and shows up as a world body with a pose', async () => {
    const mj = await loadMujoco();
    const kase = touchTheDots(robot('arm-3dof'));
    const r = await runCase(mj, kase, robot('arm-3dof'), { controller: 'reference' });
    const bodies = r.model.bodies.filter((b) => b.world?.length);

    expect(bodies.map((b) => b.world![0])).toEqual(kase.world.objects.map((o) => o.id));
    expect(r.model.xml).toContain('contype="0" conaffinity="0"');
    expect(r.frames[0].poses).toHaveLength(r.model.bodies.length * 7);
  });
});
