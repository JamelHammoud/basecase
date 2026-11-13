import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { trainAnything } from './anything';
import { bodyFacts } from './anythingBody';
import type { Ask } from './anythingClaude';
import { lowerSpec } from './anythingSignals';
import type { AnythingInput, Approval, Proposal } from './anythingTypes';
import { contractHash } from './artifacts';
import { fixtureModel } from './fixtureModels';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const scripted =
  (...answers: unknown[]): Ask =>
  async () =>
    JSON.stringify(answers.length > 1 ? answers.shift() : answers[0]);

const POSE = {
  kind: 'task',
  name: 'Elbow pose',
  seconds: 4,
  startOffsetDeg: 0,
  restIsGoal: false,
  success: {
    hold_for: {
      seconds: 1,
      within: 'whole',
      state: {
        all: [{ within: { sig: 'q:arm1', center: -40, tol: 5 } }, { within: { sig: 'q:arm0', center: 30, tol: 5 } }],
      },
    },
  },
  failures: [],
  intent: [{ t: 0 }, { t: 1.5, joints: { arm1: -40, arm0: 30 } }, { t: 4, joints: { arm1: -40, arm0: 30 } }],
};

function input(approve: (p: Proposal) => Promise<Approval>, prompt = 'Set arm1 to -40° and arm0 to 30°.') {
  const saved: string[] = [];
  const run: AnythingInput = {
    mj,
    prompt,
    design: 'test-arm',
    model: fixtureModel('arm-3dof'),
    approve,
    forge: async () => ({ ok: false, policy: null, events: [], stderr: 'no forge here' }),
    save: async (path) => {
      saved.push(path);
    },
    budget: { steps: 1e6, wallS: 600 },
    signal: new AbortController().signal,
  };

  return { run, saved };
}

describe('trainAnything', () => {
  it('lowers robot-frame signals to the world signals Arena reads', () => {
    const facts = bodyFacts(mj, fixtureModel('arm-3dof'));
    const lowered = lowerSpec(
      {
        success: { eventually: { window: 'whole', state: { atom: { sig: 'link2.right', cmp: '>', value: 20 } } } },
        failures: [],
      },
      facts,
    );
    const atom = (lowered.contract.success as { eventually: { state: { atom: { cmp: string; value: number } } } })
      .eventually.state.atom;

    expect(atom.cmp).toBe('<');
    expect(atom.value).toBeCloseTo(facts.base[0] - 0.02);
    expect(lowered.signals.p_link2_x).toEqual({ kind: 'part-position', part: 'link2', axis: 'x' });
  });

  it('calls a cloth task unverifiable and a body it can’t move refused, without training', async () => {
    const never = async () => ({ approved: false as const, note: 'no' });
    const towel = await trainAnything(
      input(never, 'Fold the towel.').run,
      scripted({ kind: 'deformable', reason: 'cloth' }),
    );
    const walk = await trainAnything(input(never, 'Walk 1 m.').run, scripted({ kind: 'impossible', reason: 'bolted' }));

    expect(towel.kind).toBe('unverifiable');
    expect(walk.kind).toBe('refused');
  });

  it('refuses when the person rejects every contract', async () => {
    const { run } = input(async () => ({ approved: false, note: 'That is not what I asked for.' }));
    const outcome = await trainAnything(run, scripted(POSE));

    expect(outcome.kind).toBe('refused');
  });

  it('plans an approved pose, proves it in Arena and binds the skill to the approved contract', async () => {
    let approvedHash = '';
    const { run, saved } = input(async (proposal) => {
      approvedHash = contractHash(proposal.contract);

      return { approved: true };
    });
    const outcome = await trainAnything(run, scripted(POSE));

    expect(outcome.kind).toBe('skill');

    if (outcome.kind !== 'skill') return;

    expect(outcome.method).toBe('ik-or-motion-plan');
    expect(outcome.skill.binding.contract).toBe(approvedHash);
    expect(outcome.skill.evidence?.passed).toBe(true);
    expect(saved).toHaveLength(1);
  }, 120_000);
});
