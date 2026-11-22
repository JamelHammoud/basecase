import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { BuildRecord } from '../kit/buildRecords';
import type { Session } from './buildAlongSession';
import { useFrozenBuildAlong } from './useFrozenBuildAlong';
import { frozenBuildSession } from './frozenBuildSession';

vi.mock('./frozenBuildSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./frozenBuildSession')>()),
  frozenBuildSession: vi.fn(),
}));

it.each(['one', 'two', null])('applies a committed save only to the matching open build: %s', async (currentId) => {
  const record: BuildRecord = {
    id: 'one',
    name: 'Arm one',
    kit: 'a'.repeat(64),
    createdAt: '2026-11-20T00:00:00.000Z',
    count: 2,
    index: 0,
    completed: {},
  };
  const session = { frozen: { record }, index: 0 } as Session;
  let current: Session | null = currentId
    ? { ...session, frozen: { ...session.frozen!, record: { ...record, id: currentId } } }
    : null;
  let controls!: ReturnType<typeof useFrozenBuildAlong>;
  let commit!: (value: BuildRecord) => void;
  const committed = new Promise<BuildRecord>((resolve) => {
    commit = resolve;
  });

  function Host() {
    controls = useFrozenBuildAlong({
      session,
      setSession: (update) => {
        current = typeof update === 'function' ? update(current) : update;
      },
      openingRef: { current: 1 },
      setOpening: vi.fn(),
      viewportRef: { current: null },
      showToast: vi.fn(),
    });

    return null;
  }

  renderToStaticMarkup(createElement(Host));

  const pending = controls.saveProgress(() => committed);
  const saved = { ...record, index: 1, completed: { '0': '2026-11-20T00:01:00.000Z' } };
  const before = current;

  commit(saved);
  await pending;

  if (currentId === record.id) {
    expect(current?.frozen?.record).toEqual(saved);
    expect(current?.index).toBe(1);

    return;
  }

  expect(current).toBe(before);
});

it('opens a saved build before the scene viewport has mounted', async () => {
  const opened = { steps: [], stepParts: [], views: [], index: 0 } as Session;
  let controls!: ReturnType<typeof useFrozenBuildAlong>;
  const setSession = vi.fn();
  const setOpening = vi.fn();

  vi.mocked(frozenBuildSession).mockResolvedValue(opened);

  function Host() {
    controls = useFrozenBuildAlong({
      session: null,
      setSession,
      openingRef: { current: 0 },
      setOpening,
      viewportRef: { current: null },
      showToast: vi.fn(),
    });

    return null;
  }

  renderToStaticMarkup(createElement(Host));
  await controls.openFrozen('one');

  expect(frozenBuildSession).toHaveBeenCalledWith('one', undefined, undefined);
  expect(setSession).toHaveBeenCalledWith(opened);
  expect(setOpening).toHaveBeenLastCalledWith(false);
});
