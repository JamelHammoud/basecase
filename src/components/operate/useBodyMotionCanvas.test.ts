import { useEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { useBodyMotionCanvas } from './useBodyMotionCanvas';
import { bodyMotionRenderer } from '../../reality/bodyMotionRenderer';
import type { BodyMotionPreview } from '../../reality/bodyMotionTypes';

const state = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useEffectEvent: (event: unknown) => event,
  useRef: (current: unknown) => ({ current }),
  useState: () => [
    state.value,
    (next: unknown) => {
      state.value = next;
    },
  ],
}));
vi.mock('../../reality/bodyMotionRenderer', () => ({
  bodyMotionRenderer: vi.fn(() => ({ seek: vi.fn(), dispose: vi.fn() })),
}));

it('binds rendering failures and readiness to the retained preview being displayed', () => {
  const first = { poses: [[0]] } as BodyMotionPreview;
  const second = { poses: [[1]] } as BodyMotionPreview;

  const initial = useBodyMotionCanvas(first, 0);

  initial.canvas.current = {
    width: 2,
    height: 2,
    getContext: () => ({ transferFromImageBitmap: vi.fn() }),
  } as unknown as HTMLCanvasElement;
  vi.mocked(useEffect).mock.calls[0][0]();

  const callbacks = vi.mocked(bodyMotionRenderer).mock.calls[0][0];

  callbacks.draw(1, { width: 2, height: 2 } as ImageBitmap);
  expect(useBodyMotionCanvas(first, 0).rendered).toBe(1);
  expect(useBodyMotionCanvas(second, 0).rendered).toBeNull();
  callbacks.failed(new Error('Render failed'));
  expect(useBodyMotionCanvas(first, 0).problem).toBe('Render failed');
  expect(useBodyMotionCanvas(second, 0)).toMatchObject({ problem: '', rendered: null });
});
