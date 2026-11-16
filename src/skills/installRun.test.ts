import { expect, it, vi } from 'vitest';
import { observeInstall } from './installRun';
import type { KitOutcome } from './motorKit';
import { readyStand } from './hubSkillFixtures';
import { fixtureModel } from './fixtureModels';

const skill = readyStand(fixtureModel('quad-servo'), 'quad');
const refused: KitOutcome = {
  kind: 'refused',
  reason: 'Arena refused the policy.',
  relaxation: null,
  cost: { wallS: 1, steps: 1, forgeRuns: 1 },
  evidence: { ...skill.evidence!, passed: false },
};

it('reports failed Arena evidence and successful installs once', async () => {
  const completed = vi.fn();
  const signal = new AbortController().signal;

  await observeInstall({ signal, completed, work: () => Promise.resolve(refused) });
  expect(completed).toHaveBeenLastCalledWith({ status: 'failed', evidence: refused.evidence });

  const passed = { ...refused, kind: 'skill', skill } as unknown as KitOutcome;

  await observeInstall({ signal, completed, work: () => Promise.resolve(passed) });
  expect(completed).toHaveBeenLastCalledWith({ status: 'passed', evidence: skill.evidence });
  expect(completed).toHaveBeenCalledTimes(2);
});

it('distinguishes cancellation and infrastructure failure without Arena evidence', async () => {
  const controller = new AbortController();
  const completed = vi.fn();
  const work = () => Promise.reject(new Error('Worker stopped.'));

  await expect(observeInstall({ signal: controller.signal, completed, work })).rejects.toThrow('Worker stopped.');
  expect(completed).toHaveBeenLastCalledWith({ status: 'infrastructure' });
  controller.abort();
  await expect(observeInstall({ signal: controller.signal, completed, work })).rejects.toThrow('Worker stopped.');
  expect(completed).toHaveBeenLastCalledWith({ status: 'cancelled' });
});

it('keeps a local verdict when feedback publication fails', async () => {
  const completed = () => Promise.reject(new Error('Offline.'));

  await expect(
    observeInstall({ signal: new AbortController().signal, completed, work: () => Promise.resolve(refused) }),
  ).resolves.toBe(refused);
});

it.each([undefined, refused.evidence])(
  'keeps trainer infrastructure failure neutral with evidence %j',
  async (evidence) => {
    const completed = vi.fn();

    await observeInstall({
      signal: new AbortController().signal,
      completed,
      infrastructure: () => true,
      work: () => Promise.resolve({ ...refused, evidence }),
    });
    expect(completed).toHaveBeenCalledWith({ status: 'infrastructure' });
  },
);
