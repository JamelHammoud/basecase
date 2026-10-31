import { describe, expect, it } from 'vitest';
import type { SavedSceneRecord } from '../../../types/robotics';
import { webRequest } from './webBackend';
import { summarizeScene } from './webScenes';

const body = async (path: string, init?: RequestInit) => {
  const res = await webRequest(path, init);

  return { status: res.status, json: await res.json() };
};

describe('web demo backend', () => {
  it('answers the agent as disconnected without a server', async () => {
    const { status, json } = await body('/acp-status?workspace=tab-1');

    expect(status).toBe(200);
    expect(json.connected).toBe(false);
  });

  it('points desktop-only calls at the download', async () => {
    const prompt = await body('/acp-prompt', { method: 'POST', body: JSON.stringify({ action: 'build' }) });
    const slice = await body('/print-slice', { method: 'POST', body: '{}' });

    expect(prompt).toEqual({ status: 501, json: { error: 'Download Basecase to use the agent.' } });
    expect(slice.json.error).toBe('Download Basecase to slice and print.');
  });

  it('summarizes scenes like the desktop library', () => {
    const record = {
      id: 'arm',
      name: 'Arm',
      globalGoal: '',
      updatedAt: '2026-10-31T00:00:00.000Z',
      partCount: 0,
      parts: [{ kind: 'component' }, { kind: 'cube', hardware: { type: 'socket' } }, { kind: 'cube' }],
      annotations: [{}],
    } as unknown as SavedSceneRecord;

    expect(summarizeScene(record)).toMatchObject({ partCount: 3, catalogCount: 2, commentCount: 1 });
  });
});
