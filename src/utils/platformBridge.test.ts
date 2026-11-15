import { afterEach, describe, expect, it, vi } from 'vitest';
import { platformBridge } from './platformBridge';

const message = 'The STEP export took longer than 5 minutes. Hide the largest parts and export again.';

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

describe('platformBridge.robotReadRun', () => {
  it('passes the captured unit to desktop IPC', async () => {
    const robotReadRun = vi.fn(async () => null);

    vi.stubGlobal('window', { electronAPI: { robotReadRun } });

    await expect(platformBridge.robotReadRun('arm-b')).resolves.toBeNull();
    expect(robotReadRun).toHaveBeenCalledWith('arm-b');
  });

  it('passes the same unit to the HTTP reader', async () => {
    const fetch = vi.fn(async () => new Response('null', { status: 200 }));

    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', fetch);

    await expect(platformBridge.robotReadRun('arm-b')).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/bridge/robot-read-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arg: 'arm-b' }),
    });
  });
});
