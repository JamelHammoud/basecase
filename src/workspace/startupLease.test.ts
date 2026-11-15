import { describe, expect, it, vi } from 'vitest';
import { StartupLease } from './startupLease';

function delayed() {
  let finish: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });

  return { promise, finish };
}

describe('asynchronous run preparation', () => {
  it('releases a preparation completed after Stop without starting', async () => {
    const lease = new StartupLease();
    const pending = delayed();
    const release = vi.fn();
    const start = vi.fn();
    const ticket = lease.claim();
    const operation = pending.promise.then(() => {
      if (lease.retain(ticket, release)) start();
    });

    lease.cancel();
    pending.finish();
    await operation;
    expect(release).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it('keeps a replacement preparation when an older operation finishes', async () => {
    const lease = new StartupLease();
    const older = lease.claim();
    const current = lease.claim();
    const releaseOlder = vi.fn();
    const releaseCurrent = vi.fn();

    expect(lease.retain(current, releaseCurrent)).toBe(true);
    expect(lease.retain(older, releaseOlder)).toBe(false);
    expect(lease.current(current)).toBe(true);
    expect(releaseOlder).toHaveBeenCalledOnce();
    expect(releaseCurrent).not.toHaveBeenCalled();
    lease.cancel();
    lease.cancel();
    expect(releaseCurrent).toHaveBeenCalledOnce();
  });

  it('invalidates a startup awaiting compilation before any model was prepared', async () => {
    const lease = new StartupLease();
    const compiling = delayed();
    const prepare = vi.fn();
    const ticket = lease.claim();
    const operation = compiling.promise.then(() => {
      if (lease.current(ticket)) prepare();
    });

    lease.cancel();
    compiling.finish();
    await operation;
    expect(prepare).not.toHaveBeenCalled();
  });

  it('rejects a late simulator start after its preparation was released', async () => {
    const lease = new StartupLease();
    const ticket = lease.claim();
    const started = delayed();
    const release = vi.fn();
    const record = vi.fn();

    lease.retain(ticket, release);

    const operation = started.promise.then(() => {
      if (lease.current(ticket)) record();
    });

    lease.cancel();
    started.finish();
    await operation;
    expect(record).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('completed startup ownership', () => {
  it('ignores completion of a superseded startup', () => {
    const lease = new StartupLease();
    const older = lease.claim();
    const current = lease.claim();
    const release = vi.fn();

    lease.retain(current, release);
    lease.finish(older);
    expect(lease.current(current)).toBe(true);
    expect(release).not.toHaveBeenCalled();
    lease.finish(current);
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('Case world preparation', () => {
  it('claims the new startup after world replacement stops the previous simulator', () => {
    const lease = new StartupLease();
    const older = lease.claim();
    const release = vi.fn();

    lease.retain(older, release);

    const ticket = lease.claimAfter(() => lease.cancel());

    expect(release).toHaveBeenCalledOnce();
    expect(lease.current(older)).toBe(false);
    expect(lease.current(ticket)).toBe(true);
    lease.cancel();
    expect(lease.current(ticket)).toBe(false);
  });
});
