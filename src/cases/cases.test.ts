import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { evaluateContract, type State } from '../skills/contract';
import { scaledFormula, type Contract, type Trace } from './contract';
import { parseCase, runCase, touchTheDots } from './testing';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;
const above = (value: number) => ({ atom: { expr: { signal: 'x' }, cmp: '>' as const, value, scale: 1 } });
const scaledAbove = (value: number, s: number) => ({
  atom: { expr: { signal: 'x' }, cmp: '>' as const, value: value * s, scale: s },
});
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

describe('Case contracts', () => {
  it('carry any contract the Rust evaluator reads, and scale distances but not angles', () => {
    const kase = touchTheDots(robot('arm-3dof'));
    const angled: Contract = contract({
      all: [
        { always: { window: { from: 0, to: 1 }, state: { any: [above(1), { not: above(2) }] } } },
        {
          eventually: {
            window: 'whole',
            state: {
              atom: {
                expr: {
                  angle: [
                    ['a', 'b', 'c'],
                    ['d', 'e', 'f'],
                  ],
                },
                cmp: '<',
                value: 0.5,
                scale: 0.1,
              },
            },
          },
        },
      ],
    });

    expect(parseCase({ ...kase, task: { ...kase.task, contract: angled } }).task.contract).toEqual(angled);
    expect(scaledFormula(angled.success, 2)).toEqual({
      all: [
        {
          always: {
            window: { from: 0, to: 1 },
            state: { any: [scaledAbove(1, 2), { not: scaledAbove(2, 2) }] },
          },
        },
        (angled.success as { all: Contract['success'][] }).all[1],
      ],
    });
  });

  it('refuse values a contract can’t carry', () => {
    const kase = JSON.parse(JSON.stringify(touchTheDots(robot('arm-3dof'))));
    const deep = Array.from({ length: 80 }).reduce<State>((inner) => ({ not: inner }), above(1));

    expect(() =>
      parseCase({ ...kase, task: { ...kase.task, contract: { ...kase.task.contract, version: 2 } } }),
    ).toThrow();
    expect(() =>
      parseCase({ ...kase, task: { ...kase.task, contract: contract({ always: { window: 'whole', state: deep } }) } }),
    ).toThrow(/deeply/);
  });

  it('judge with the Rust evaluator', async () => {
    const eventually = contract({ eventually: { window: 'whole', state: above(1) } });

    expect((await evaluateContract(eventually, trace([0, 2, 0]))).passed).toBe(true);
    await expect(evaluateContract(eventually, { dt: 0.1, signals: { y: [1, 2] } })).rejects.toThrow();
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
