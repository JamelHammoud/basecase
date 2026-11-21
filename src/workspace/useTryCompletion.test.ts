import { useEffect, useLayoutEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Simulation } from '../sim/useSimulation';
import { TeachingLink } from '../sim/teachingLink';
import { useFinishTry } from './useTryCompletion';
import { tryEvidenceAtFinish, useTryEvidence } from './useTryEvidence';

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
  useEffectEvent: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
}));

beforeEach(() => vi.clearAllMocks());

function mountEffects() {
  return [useLayoutEffect, useEffect].flatMap((hook) => vi.mocked(hook).mock.calls.map(([effect]) => effect()));
}

it('finishes the original teaching record on scene retirement and ignores another session completion', () => {
  const teaching = new TeachingLink();
  const finish = vi.fn(async () => {});
  const detach = vi.fn();
  const subscribeStop = vi.fn(() => detach);

  useFinishTry({
    sim: { teaching, subscribeStop, drive: { active: true } } as unknown as Simulation,
    phase: 'running',
    recordId: () => 7,
    seconds: 30,
    elapsed: 1,
    finish,
  });

  const cleanups = mountEffects();

  teaching.completed(8);
  expect(finish).not.toHaveBeenCalled();
  teaching.completed(7);
  expect(finish).toHaveBeenCalledTimes(1);
  finish.mockClear();
  cleanups.forEach((cleanup) => cleanup?.());
  expect(detach).toHaveBeenCalledOnce();
  expect(finish).toHaveBeenCalledOnce();
  teaching.completed(7);
  expect(finish).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'captures teaching validity before passive teardown without admitting earlier edits, edited=%s',
  async (edited) => {
    const evidence = useTryEvidence({ scope: {}, parts: [], joints: [], partners: () => [] });
    const retained = vi.fn();
    const finish = vi.fn(async () => {
      const current = tryEvidenceAtFinish(7, evidence.current);

      await Promise.resolve();
      retained(current());
    });

    useFinishTry({
      sim: {
        teaching: new TeachingLink(),
        subscribeStop: () => () => {},
        drive: { active: true },
      } as unknown as Simulation,
      phase: 'running',
      recordId: () => 7,
      seconds: 30,
      elapsed: 1,
      finish,
    });

    const cleanups = mountEffects();
    const invalidate = vi.mocked(useEffect).mock.calls[0][0]()!;

    evidence.begin();

    if (edited) invalidate();

    cleanups.forEach((cleanup) => cleanup?.());
    await Promise.resolve();
    expect(evidence.current()).toBe(false);
    expect(finish).toHaveBeenCalledOnce();
    expect(retained).toHaveBeenCalledWith(!edited);
  },
);
