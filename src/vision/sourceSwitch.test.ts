import { describe, expect, it, vi } from 'vitest';
import { switchVisionSource } from './sourceSwitch';

describe('camera source switching', () => {
  it('closes a source that finishes opening after its subscriber stops', async () => {
    let change: () => void = () => undefined;
    let opened: ((stop: () => void) => void) | undefined;
    const live = vi.fn();
    const recorded = vi.fn();
    const unsubscribe = vi.fn();
    const start = vi
      .fn()
      .mockResolvedValueOnce(live)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            opened = resolve;
          }),
      );
    const stop = await switchVisionSource({
      start,
      error: vi.fn(),
      subscribe: (follow) => {
        change = follow;

        return unsubscribe;
      },
    });

    change();
    expect(live).toHaveBeenCalledOnce();
    stop();
    stop();
    opened?.(recorded);
    await Promise.resolve();
    expect(recorded).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
