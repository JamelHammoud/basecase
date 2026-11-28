import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ToastData } from '../design-system';
import { useToast } from './useToast';

const state = vi.hoisted(() => ({ toast: null as ToastData | null }));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [
    state.toast,
    (update: ToastData | null | ((previous: ToastData | null) => ToastData | null)) => {
      state.toast = typeof update === 'function' ? update(state.toast) : update;
    },
  ],
}));

beforeEach(() => {
  state.toast = null;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-28T00:00:00Z'));
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function session() {
  let toasts!: ReturnType<typeof useToast>;

  function Host() {
    toasts = useToast(vi.fn());

    return null;
  }

  renderToStaticMarkup(createElement(Host));

  return toasts;
}

it('keeps a newer toast when an older job finishes or is canceled in the same millisecond', () => {
  const toasts = session();
  const first = toasts.showToast('Importing first…', { tone: 'progress' });
  const second = toasts.showToast('Importing second…', { tone: 'progress' });

  expect(second).toBeGreaterThan(first);
  toasts.dismissToast(first);
  expect(state.toast).toMatchObject({ id: second, message: 'Importing second…' });
  toasts.dismissToast(second);
  expect(state.toast).toBeNull();
});

it('retains ordinary dismissal, timer expiration and progress lifetime', () => {
  const toasts = session();

  toasts.showToast('Saved');
  vi.advanceTimersByTime(2799);
  expect(state.toast?.message).toBe('Saved');
  vi.advanceTimersByTime(1);
  expect(state.toast).toBeNull();
  toasts.showToast('Working…', { tone: 'progress' });
  vi.advanceTimersByTime(10000);
  expect(state.toast?.message).toBe('Working…');
  toasts.dismissToast();
  expect(state.toast).toBeNull();
  toasts.showToast('Saved');
  Reflect.apply(toasts.dismissToast, undefined, [{ type: 'click' }]);
  expect(state.toast).toBeNull();
});

it('does not let an older timer clear replacement progress and retains action duration', () => {
  const toasts = session();

  toasts.showToast('Saved');
  toasts.showToast('Working…', { tone: 'progress' });
  vi.advanceTimersByTime(5000);
  expect(state.toast?.message).toBe('Working…');
  toasts.showToast('Deleted', { action: { label: 'Undo', onClick: vi.fn() } });
  vi.advanceTimersByTime(4999);
  expect(state.toast?.message).toBe('Deleted');
  vi.advanceTimersByTime(1);
  expect(state.toast).toBeNull();
});
