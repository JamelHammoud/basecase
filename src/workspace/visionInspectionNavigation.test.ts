import { describe, expect, it, vi } from 'vitest';
import { encodeRecording } from '../cases/recordingFile';
import { inspectionRecording } from '../vision/training/inspectionSourceFixtures';
import { preparationTry } from '../vision/training/prepareFixtures';
import { inspectionSourceIdentity } from '../vision/training/inspectionSource';
import { visionInspectionNavigation } from './visionInspectionNavigation';
import { readTimelineSource } from './tryTimelineSource';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { TrainingRun } from '../vision/training/serviceTypes';
import type { StoredTry } from '../cases/tryFile';

const ports = vi.hoisted(() => ({ manifests: vi.fn(), bytes: vi.fn(), recording: vi.fn() }));

vi.mock('../cases/tryStore', () => ({
  loadManifests: ports.manifests,
  loadRecordingBytes: ports.bytes,
  loadRecording: ports.recording,
}));

async function navigationFixture() {
  const stored: StoredTry = { ...preparationTry('source'), startedAt: '2026-11-16T00:00:00Z', frames: 2 };
  const recording = inspectionRecording();
  const bytes = encodeRecording(recording);
  const identity = await inspectionSourceIdentity(bytes, stored);
  const run = {
    status: 'retained',
    provenance: [
      {
        source: 'try:source',
        root: 'try:source',
        real: true,
        manifests: [structuredClone(stored)],
        inspection: identity,
      },
    ],
  } as TrainingRun;
  const show = vi.fn(async () => true);
  const core = {
    simTraining: { cases: { timeline: { show } } },
    frameLabels: { open: vi.fn() },
  } as unknown as WorkspaceCore;

  ports.manifests.mockResolvedValue([stored]);
  ports.bytes.mockResolvedValue(bytes);

  return { stored, recording, bytes, run, show, navigation: visionInspectionNavigation(core, run) };
}

describe('comparison source navigation', () => {
  it('passes verified historical recording bytes and the exact frame to existing playback', async () => {
    const { navigation, run, show, recording, stored } = await navigationFixture();
    const frame = { origin: { tryId: stored.id, frame: 1, seconds: 0.02 } };

    await navigation.source(frame as never, () => true);

    expect(show).toHaveBeenCalledOnce();

    const args = show.mock.calls[0] as unknown as Parameters<WorkspaceCore['simTraining']['cases']['timeline']['show']>;
    const reopened = await readTimelineSource(stored.id, undefined, args[3]!);

    expect(args[1]).toBe(1);
    expect(reopened).toEqual([recording, [stored]]);
    expect(ports.recording).not.toHaveBeenCalled();
    expect(run.status).toBe('retained');
  });

  it('refuses changed or missing source content and ignores cancellation or scene switches', async () => {
    const { navigation, stored, show, recording } = await navigationFixture();
    const frame = { origin: { tryId: stored.id, frame: 1, seconds: 0.02 } };

    ports.bytes.mockResolvedValue(encodeRecording({ ...recording, ctrl: new Float32Array([1, 0]) }));
    await expect(navigation.source(frame as never, () => true)).rejects.toThrow('unavailable');
    ports.bytes.mockResolvedValue(null);
    await expect(navigation.source(frame as never, () => true)).rejects.toThrow('unavailable');
    ports.bytes.mockResolvedValue(encodeRecording(recording));
    ports.manifests.mockResolvedValue([{ ...stored, seed: 2 }]);
    await expect(navigation.source(frame as never, () => true)).rejects.toThrow('unavailable');
    ports.manifests.mockResolvedValue([stored]);
    await navigation.source(frame as never, () => false);
    expect(show).not.toHaveBeenCalled();
  });
});
