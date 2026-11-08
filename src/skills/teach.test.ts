import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import type { Contract } from './contract';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob, ForgeRunner } from './forgeRunner';
import { draftSkill, raceDraft, raceSummary, type DraftInput } from './teach';

const bendElbow: Contract = {
  version: 1,
  success: {
    hold_for: {
      seconds: 0.2,
      within: 'whole',
      state: { atom: { expr: { signal: 'q_arm1' }, cmp: '>', value: 0.6, scale: 0.05 } },
    },
  },
  failures: [],
};

const walk: Contract = {
  version: 1,
  success: {
    eventually: {
      window: 'whole',
      state: { atom: { expr: { delta: { signal: 'forward' } }, cmp: '>', value: 0.3, scale: 0.1 } },
    },
  },
  failures: [
    {
      label: 'fell',
      formula: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'tilt' }, cmp: '>', value: 1, scale: 0.1 } } },
      },
    },
  ],
};

const armDraft = (patch: Partial<DraftInput> = {}): DraftInput => ({
  name: 'bend',
  request: 'bend the elbow up',
  goal: { kind: 'open' },
  seconds: 0.6,
  contract: bendElbow,
  ...patch,
});

function stubForge() {
  const jobs: ForgeJob[] = [];
  const forge: ForgeRunner = (job) => {
    jobs.push(job);

    return Promise.resolve({ ok: false, policy: null, events: [], stderr: 'stub forge: no policy' });
  };

  return { jobs, forge };
}

const noSave = () => Promise.reject(new Error('nothing passes here'));

describe('drafting a skill', () => {
  it('shows the contract in words, the route and a rollout that fails while holding still', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('arm-3dof');
    const result = await draftSkill({ mj, model, design: 'arm', request: armDraft() });

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    const { report } = result;

    expect(report.words).toEqual(['Passes when: q_arm1 above 0.6, held 0.2 s within the whole try.']);
    expect(report.rollouts.map((r) => [r.label, r.passed])).toEqual([['Holding still', false]]);
    expect(report.warnings).toEqual([]);
    expect(report.draft.environment.signals.q_arm1).toEqual({ kind: 'joint-position', joint: 'arm1' });
    expect(report.route.method).toBe('lqr-or-mpc');
  });

  it('warns when holding still already passes', async () => {
    const mj = await loadMujoco();
    const easy: Contract = {
      version: 1,
      success: {
        always: { window: 'whole', state: { atom: { expr: { signal: 'time' }, cmp: '>', value: -1, scale: 1 } } },
      },
      failures: [],
    };
    const result = await draftSkill({
      mj,
      model: fixtureModel('arm-3dof'),
      design: 'arm',
      request: armDraft({ contract: easy }),
    });

    expect(result.ok && result.report.warnings[0]).toMatch(/^Holding still already passes/);
  });

  it('refuses what the robot or the contract can’t support, in plain words', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('arm-3dof');
    const missing: Contract = {
      ...bendElbow,
      success: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'nose' }, cmp: '>', value: 0, scale: 1 } } },
      },
    };
    const bad = await draftSkill({ mj, model, design: 'arm', request: armDraft({ contract: missing, seconds: 900 }) });
    const part = await draftSkill({
      mj,
      model,
      design: 'arm',
      request: armDraft({ goal: { kind: 'reach', part: 'ghost', waypoints: [{ point_mm: [0, 0, 100] }] } }),
    });

    expect(bad).toEqual({ ok: false, problems: ['A try lasts 0.5 to 60 s.'] });
    expect(part).toEqual({ ok: false, problems: ['The robot has no part ghost.'] });

    const unknown = await draftSkill({ mj, model, design: 'arm', request: armDraft({ contract: missing }) });

    expect(unknown).toEqual({ ok: false, problems: ['The contract reads nose, which no signal provides.'] });
  });
});

describe('racing a draft', () => {
  it('says what it tried when nothing is built for the task', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('arm-3dof');
    const drafted = await draftSkill({ mj, model, design: 'arm', request: armDraft() });
    const { jobs, forge } = stubForge();

    if (!drafted.ok) throw new Error(drafted.problems.join(' '));

    const outcome = await raceDraft({ mj, model, draft: drafted.report.draft, forge, save: noSave });

    expect(outcome.kind).toBe('not-found');
    expect(outcome.attempts.map((a) => a.method)).toEqual([
      'lqr-or-mpc',
      'tracking-rl-with-reset-curriculum',
      'reward-search',
    ]);
    expect(raceSummary(outcome).at(-1)).toBe(
      'reward-search: Forge trains robots with a floating base, and this one is fixed.',
    );
    expect(jobs).toEqual([]);
  });

  it('trains a walk through the Forge runner it is given, and reports the runner’s failure', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const drafted = await draftSkill({
      mj,
      model,
      design: 'quad',
      request: {
        name: 'stroll',
        request: 'walk forward',
        goal: { kind: 'velocity', command: [0.1, 0, 0] },
        seconds: 4,
        contract: walk,
      },
    });
    const { jobs, forge } = stubForge();

    if (!drafted.ok) throw new Error(drafted.problems.join(' '));

    expect(drafted.report.route.method).toBe('reward-search');

    const outcome = await raceDraft({ mj, model, draft: drafted.report.draft, forge, save: noSave });

    expect(outcome.kind).toBe('not-found');
    expect(jobs.length).toBeGreaterThan(0);
    expect(new Set(jobs.map((j) => j.name))).toEqual(new Set(['Race: stroll']));
    expect(jobs.map((j) => j.job.command)).toContainEqual([0.1, 0, 0]);
    expect(outcome.attempts[0].reason).toBe('stub forge: no policy');
  });
});
