import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { contract, sig, always, atom } from './formula';
import { StandIn } from './approver';
import { generatePair, PoserPool, validity, zooGrid, type PairRef } from './generator';
import { hiddenArenaPasses } from './judge';
import { leakCount } from './leak.mjs';
import { labelled, variantsOf } from './rollouts';
import { freshSeed, seededRng } from './rng';
import { secretsOf } from './run';
import { zooVerdict, type PairResult } from './score';
import { zooTask } from './tasks';
import { zooBody } from './bodies';

const ref = (task: string, body: string): PairRef => zooGrid().find((p) => p.task === task && p.body === body)!;

const honest = (id: string, expect: PairResult['expect']): PairResult => ({
  id,
  expect,
  outcome: expect === 'deformable' ? 'unverifiable' : 'not-found',
  claimed: false,
  bound: false,
  hiddenPass: null,
  withinBudget: true,
  wallS: 60,
  steps: 0,
  method: null,
  routerMiss: null,
});

const winner = (id: string, routerMiss: boolean): PairResult => ({
  ...honest(id, 'feasible'),
  outcome: 'skill',
  claimed: true,
  bound: true,
  hiddenPass: true,
  method: 'reward-search',
  routerMiss,
});

const all = (n: number, make: (i: number) => PairResult) => Array.from({ length: n }, (_, i) => make(i));

describe('AnythingZoo canaries: the gate’s own judges catch planted faults', () => {
  it('canary limp claim: a do-nothing skill claimed as passing is not a false claim', async () => {
    const mj = await loadMujoco();
    const pair = await generatePair(mj, freshSeed(), ref('move-forward', 'quad-servo'));
    const body = zooBody('quad-servo');
    const robot = body.model.robots[0];
    const joints = body.model.joints.filter((j) => j.robot === robot.key).map((j) => j.id);
    const judged = {
      controller: { kind: 'hold' as const },
      observation: [{ kind: 'joint-positions' as const, joints }],
      action: { kind: 'position-offset' as const, joints, scale: 0.25, controlDt: 0.02 },
    };
    const hiddenPass = await hiddenArenaPasses(mj, body, pair.hidden!, judged);
    const claim = { ...winner(pair.id, false), hiddenPass };

    expect(zooVerdict([claim], 1).problems.filter((p) => p.startsWith('False'))).toEqual([]);
  }, 900_000);

  it('canary deformable claim: a skill claimed for folding a towel passes', () => {
    const claim = { ...winner('fold-a-towel@arm-6dof', false), expect: 'deformable' as const };

    expect(zooVerdict([claim], 1).problems.filter((p) => !p.startsWith('Passed') && !p.startsWith('Router'))).toEqual(
      [],
    );
  });

  it('canary rubber stamp: a contract that passes everything is approved', async () => {
    const mj = await loadMujoco();
    const pool = new PoserPool(mj);
    const pair = await generatePair(mj, freshSeed(), ref('reach-point', 'arm-6dof'), pool);
    const standIn = new StandIn(pool.get('arm-6dof'), pair.rollouts);
    const stamp = contract(always(atom(sig('t'), '>', -1, 1)));
    const answer = await standIn.approve({ contract: stamp, signals: { t: { kind: 'time' } } });

    pool.dispose();
    expect(answer.approved).toBe(true);
  }, 300_000);

  it('canary give-up: honest not-found on every feasible pair meets the pass bar', () => {
    const results = all(14, (i) => honest(`p${i}`, 'feasible'));

    expect(zooVerdict(results, 14).problems.filter((p) => p.startsWith('Passed'))).toEqual([]);
  });

  it('canary lazy router: a router slower than 2x the cheapest on most pairs passes', () => {
    const results = all(14, (i) => winner(`p${i}`, i % 3 !== 0));

    expect(zooVerdict(results, 14).problems.filter((p) => p.startsWith('Router'))).toEqual([]);
  });

  it('canary leak: a log that prints a hidden contract is clean', async () => {
    const mj = await loadMujoco();
    const seed = freshSeed();
    const pair = await generatePair(mj, seed, ref('crouch', 'hexapod'));
    const log = `pair 3 of 20\n${JSON.stringify(pair.hidden!.contract)}\nTests 1 passed`;

    expect(leakCount(log, secretsOf(seed, [pair]))).toBe(0);
  }, 300_000);

  it('canary free pass: a hidden judge that standing still meets is accepted', async () => {
    const mj = await loadMujoco();
    const pool = new PoserPool(mj);
    const poser = pool.get('rover-diff');
    const rng = seededRng(freshSeed());
    const heightM = poser.rootAt()[2];
    const draw = zooTask('move-forward').draw!({ rng, body: poser.body, poser, heightM });
    const lazy = { ...draw, contract: contract(always(atom(sig('height'), '>', 0, 0.01))) };
    const rollouts = await labelled(poser, lazy, variantsOf(lazy, rng, heightM));
    const valid = await validity(mj, poser, lazy, rollouts);

    pool.dispose();
    expect(valid.ok).toBe(true);
  }, 300_000);
});
