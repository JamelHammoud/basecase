import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { box } from '../sim/fixtures/parts';
import { resolvePrinter } from '../data/printers';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { readinessOf } from '../readiness/readiness';
import type { Readiness } from '../readiness/types';
import { runReadiness } from './runReadiness';
import { useReadiness, type ReadinessHandle } from './useReadiness';

vi.mock('./runReadiness', async (original) => ({
  ...(await original<typeof import('./runReadiness')>()),
  runReadiness: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

function harness() {
  const partsRef = { current: [box('plate', [0, 0, 0], [20, 20, 10], 10)] };
  const projectRef = { current: DEFAULT_PROJECT };
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  vi.mocked(runReadiness).mockImplementation(
    (input) =>
      new Promise<Readiness>((resolve, reject) => {
        pending.push({ resolve: () => resolve(readinessOf([], input)), reject });
      }),
  );

  let handle: ReadinessHandle | undefined;
  const Host = () => {
    handle = useReadiness({
      parts: partsRef.current,
      project: projectRef.current,
      partsRef,
      projectRef,
      printer: resolvePrinter('default', []),
      viewportRef: { current: {} as Viewport3DHandle },
    });

    return null;
  };

  renderToStaticMarkup(createElement(Host));

  return {
    handle: handle!,
    pending,
    edit: () => {
      partsRef.current = [{ ...partsRef.current[0], position: [37, 0, 0] }];
    },
  };
}

it.each(['resolve', 'reject'] as const)(
  'refuses a check that can %s after an interleaved edit and publishes the fresh check',
  async (finish) => {
    const { handle, pending, edit } = harness();
    const stale = handle.checkNow();

    expect(handle.checkNow()).toBe(stale);
    edit();

    const fresh = handle.checkNow();

    pending[1].resolve();

    const accepted = await fresh;

    expect(accepted?.status).toBe('ready');
    pending[0][finish](new Error('Old check failed'));
    await expect(stale).resolves.toBeNull();
    expect(handle.latest()?.fingerprint).toBe(accepted?.fingerprint);
    expect(runReadiness).toHaveBeenCalledTimes(2);
  },
);
