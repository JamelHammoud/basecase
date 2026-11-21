import { useEffect } from 'react';
import { expect, it, vi } from 'vitest';
import type { Simulation } from '../sim/useSimulation';
import { TeachingLink } from '../sim/teachingLink';
import { useFinishTry } from './useTryCompletion';

vi.mock('react', () => ({ useEffect: vi.fn(), useEffectEvent: (callback: unknown) => callback }));

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

  const cleanups = vi.mocked(useEffect).mock.calls.map(([effect]) => effect());

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
