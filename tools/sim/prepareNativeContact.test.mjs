import { beforeEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ load: vi.fn(), prepare: vi.fn(), close: vi.fn() }));

vi.mock('@mujoco/mujoco', () => ({ default: calls.load }));
vi.mock('./nativeContactReplay.mjs', () => ({
  prepareNativeContactReplay: calls.prepare,
  closeNativeContactReplays: calls.close,
}));

const { prepareNativeContact } = await import('./prepareNativeContact.mjs');

beforeEach(() => {
  vi.clearAllMocks();
  calls.load.mockResolvedValue({ mj_versionString: () => '4.3.0' });
  calls.prepare.mockResolvedValue();
  calls.close.mockResolvedValue();
});

it('prepares the exact WASM engine version and closes its verification process', async () => {
  await prepareNativeContact();
  expect(calls.prepare).toHaveBeenCalledExactlyOnceWith('4.3.0');
  expect(calls.close).toHaveBeenCalledOnce();
});

it('closes the verification process and propagates dependency preparation failures', async () => {
  const failure = new Error('Native runtime unavailable');

  calls.prepare.mockRejectedValue(failure);
  await expect(prepareNativeContact()).rejects.toBe(failure);
  expect(calls.close).toHaveBeenCalledOnce();
});

it('does not start native preparation when the WASM version cannot be loaded', async () => {
  const failure = new Error('WASM unavailable');

  calls.load.mockRejectedValue(failure);
  await expect(prepareNativeContact()).rejects.toBe(failure);
  expect(calls.prepare).not.toHaveBeenCalled();
});
