import { beforeEach, expect, it, vi } from 'vitest';
import { bodyMotionRenderer } from './bodyMotionRenderer';
import type { BodyMotionPreview } from './bodyMotionTypes';

const state = vi.hoisted(() => ({
  call: vi.fn(),
  dispose: vi.fn(),
  pending: new Map<number, (bitmap: ImageBitmap) => void>(),
}));

vi.mock('../utils/workerRpc', () => ({ workerClient: () => ({ call: state.call, dispose: state.dispose }) }));

beforeEach(() => {
  vi.clearAllMocks();
  state.pending.clear();
  state.call.mockImplementation((operation: string, index: number) =>
    operation === 'load'
      ? Promise.resolve(true)
      : new Promise<ImageBitmap>((resolve) => {
          state.pending.set(index, resolve);
        }),
  );
});

it('keeps one rendered frame active and only the newest requested pose pending', async () => {
  const draw = vi.fn();
  const failed = vi.fn();
  const preview = { poses: [[0], [1], [2], [3]] } as BodyMotionPreview;
  const session = bodyMotionRenderer({ preview, draw, failed });

  session.seek(0);
  await vi.waitFor(() => expect(state.pending.has(0)).toBe(true));
  session.seek(1);
  session.seek(2);
  session.seek(3);
  expect([...state.pending.keys()]).toEqual([0]);

  const obsolete = { close: vi.fn() } as unknown as ImageBitmap;

  state.pending.get(0)!(obsolete);
  await vi.waitFor(() => expect(state.pending.has(3)).toBe(true));
  expect(obsolete.close).toHaveBeenCalledOnce();
  expect(draw).not.toHaveBeenCalled();

  const latest = { close: vi.fn() } as unknown as ImageBitmap;

  state.pending.get(3)!(latest);
  await vi.waitFor(() => expect(draw).toHaveBeenCalledWith(3, latest));
  expect(failed).not.toHaveBeenCalled();
  expect(state.call.mock.calls.filter(([operation]) => operation === 'frame').map(([, index]) => index)).toEqual([
    0, 3,
  ]);
  session.dispose();
  expect(state.dispose).toHaveBeenCalledOnce();
});

it('closes a bitmap delivered after disposal without publishing it into another view', async () => {
  const draw = vi.fn();
  const failed = vi.fn();
  const session = bodyMotionRenderer({ preview: {} as BodyMotionPreview, draw, failed });

  session.seek(0);
  await vi.waitFor(() => expect(state.pending.has(0)).toBe(true));
  session.dispose();

  const late = { close: vi.fn() } as unknown as ImageBitmap;

  state.pending.get(0)!(late);
  await vi.waitFor(() => expect(late.close).toHaveBeenCalledOnce());
  expect(draw).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
});
