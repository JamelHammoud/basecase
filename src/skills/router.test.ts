import { describe, expect, it } from 'vitest';
import { REWARD_SEARCH_ROUNDS, routeTask, type TaskAnalysis } from './router';

const hard: TaskAnalysis = {
  simCanCheck: true,
  quasiStatic: false,
  motionShapeMatters: false,
  kitSkills: null,
  stateDimension: 48,
  contactRich: true,
  trajectoryOptimisation: 'no-success',
  rewardSearchRounds: REWARD_SEARCH_ROUNDS,
  demo: 'declined',
};

const route = (patch: Partial<TaskAnalysis>) => routeTask({ ...hard, ...patch });

describe('Method Router', () => {
  it('rung 1: a task the sim can’t check is labelled unverifiable, before anything else', () => {
    const r = route({ simCanCheck: false, quasiStatic: true, kitSkills: ['walk'] });

    expect(r).toMatchObject({ method: 'unverifiable', rung: 1 });
  });

  it('rung 2: a quasi-static task gets IK or a motion plan', () => {
    expect(route({ quasiStatic: true, motionShapeMatters: true })).toMatchObject({
      method: 'ik-or-motion-plan',
      rung: 2,
    });
  });

  it('rung 3: when the motion shape is the point, track it', () => {
    expect(route({ motionShapeMatters: true, kitSkills: ['walk'] })).toMatchObject({ method: 'tracking', rung: 3 });
  });

  it('rung 4: a task composable from the Kit becomes a Routine and names the skills', () => {
    const r = route({ kitSkills: ['stand', 'walk'], stateDimension: 4, contactRich: false });

    expect(r).toMatchObject({ method: 'routine', rung: 4 });
    expect(r.reason).toContain('stand, walk');
    expect(route({ kitSkills: [] }).method).not.toBe('routine');
  });

  it('rung 5: a low-dimensional task with smooth dynamics gets LQR or MPC', () => {
    expect(route({ stateDimension: 4, contactRich: false })).toMatchObject({ method: 'lqr-or-mpc', rung: 5 });
    expect(route({ stateDimension: 4, contactRich: true }).method).not.toBe('lqr-or-mpc');
    expect(route({ stateDimension: 40, contactRich: false }).method).not.toBe('lqr-or-mpc');
  });

  it('rung 6: one success from trajectory optimisation becomes tracking RL with a reset curriculum', () => {
    expect(route({ trajectoryOptimisation: 'found-success', rewardSearchRounds: 0 })).toMatchObject({
      method: 'tracking-rl-with-reset-curriculum',
      rung: 6,
    });
  });

  it('rung 7: reward search runs 6 at 5M, 2 at 25M, 1 at 100M for up to 3 rounds, warm-started after the first', () => {
    const first = route({ rewardSearchRounds: 0, demo: 'not-asked' });
    const third = route({ rewardSearchRounds: 2 });

    expect(first).toMatchObject({ method: 'reward-search', rung: 7 });
    expect(first.rewardSearch).toEqual({
      round: 1,
      warmStart: false,
      stages: [
        { candidates: 6, steps: 5_000_000 },
        { candidates: 2, steps: 25_000_000 },
        { candidates: 1, steps: 100_000_000 },
      ],
    });
    expect(third.rewardSearch).toMatchObject({ round: 3, warmStart: true });
  });

  it('rung 8: after reward search, ask for a puppeteered demo once', () => {
    expect(route({ demo: 'not-asked' })).toMatchObject({ method: 'ask-for-demo', rung: 8 });
    expect(route({ demo: 'asked' }).method).toBe('not-found');
  });

  it('rung 9: otherwise not found within budget, pointing at design relaxations', () => {
    const r = route({});

    expect(r).toMatchObject({ method: 'not-found', rung: 9 });
    expect(r.reason).toMatch(/Not found within budget/);
  });

  it('is pure: the same analysis gives the same route', () => {
    expect(route({ rewardSearchRounds: 1 })).toEqual(route({ rewardSearchRounds: 1 }));
  });
});
