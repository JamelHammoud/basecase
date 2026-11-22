import { useLayoutEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { useBodyProjectChange } from './useBodyProjectChange';

const state = vi.hoisted(() => ({ previous: { current: null as ProjectSettings | null } }));

vi.mock('react', () => ({
  useEffectEvent: (callback: unknown) => callback,
  useLayoutEffect: vi.fn(),
  useRef: (initial: ProjectSettings) => {
    state.previous.current ??= initial;

    return state.previous;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.previous.current = null;
});

it('preserves an active job through guide and evidence commits and cancels after a physical edit', () => {
  const changed = vi.fn();
  const Render = (project: ProjectSettings) => {
    useBodyProjectChange(project, changed);
    vi.mocked(useLayoutEffect).mock.lastCall![0]();
  };

  Render(DEFAULT_PROJECT);
  Render({ ...DEFAULT_PROJECT, buildGuide: { fingerprint: 'guide' } as ProjectSettings['buildGuide'] });
  Render({ ...DEFAULT_PROJECT, bodyEvidence: [] });
  expect(changed).not.toHaveBeenCalled();
  Render({ ...DEFAULT_PROJECT, joints: [] });
  expect(changed).toHaveBeenCalledOnce();
});
