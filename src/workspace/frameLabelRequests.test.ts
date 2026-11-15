import { describe, expect, it, vi } from 'vitest';
import { FrameLabelRequests } from './frameLabelRequests';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('frame label request ownership', () => {
  it('cancels an external refresh when another edit joins the save queue', async () => {
    const requests = new FrameLabelRequests();
    const saving = deferred<void>();
    const load = vi.fn(async () => ({ id: 'stale' }));
    const refresh = requests.read(saving.promise, load);

    requests.invalidate();
    saving.resolve();
    expect(await refresh).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('discards an in-flight frame read when the editor closes or another frame set opens', async () => {
    const requests = new FrameLabelRequests();
    const loading = deferred<{ id: string }>();
    const load = vi.fn(() => loading.promise);
    const opening = requests.read(Promise.resolve(), load);

    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    requests.invalidate();
    loading.resolve({ id: 'closed' });
    expect(await opening).toBeUndefined();
    expect(await requests.read(Promise.resolve(), async () => ({ id: 'current' }))).toEqual({ id: 'current' });
  });
});
