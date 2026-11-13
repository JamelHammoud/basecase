import { afterEach, describe, expect, it, vi } from 'vitest';
import { platformBridge } from './platformBridge';

const message = 'The STEP export took longer than 5 minutes. Hide the largest parts and try again.';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('platformBridge.exportStep on desktop', () => {
  it('rejects with the kernel sentence, not the IPC wrapper', async () => {
    const exportStep = vi.fn(() =>
      Promise.reject(new Error(`Error invoking remote method 'cad:export-step': Error: ${message}`)),
    );

    vi.stubGlobal('window', { electronAPI: { exportStep } });

    await expect(platformBridge.exportStep({ name: 'Scene', bodies: [] })).rejects.toThrow(new Error(message));
    expect(exportStep).toHaveBeenCalledOnce();
  });
});
