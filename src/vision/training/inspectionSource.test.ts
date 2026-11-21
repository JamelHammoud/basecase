import { describe, expect, it } from 'vitest';
import { inspectionSourceIdentity, restoreInspectionSource } from './inspectionSource';
import { encodeRecording } from '../../cases/recordingFile';
import { inspectionRecording } from './inspectionSourceFixtures';
import { preparationTry } from './prepareFixtures';

describe('historical source identity', () => {
  it('opens the exact timestamp and rejects replaced recordings, videos and timestamps', async () => {
    const recording = inspectionRecording();
    const stored = { ...preparationTry('source'), videos: [{ camera: 'wrist', path: 'wrist.mp4', from: 0, to: 1 }] };
    const bytes = encodeRecording(recording);
    const video = new Uint8Array([1, 2, 3]);
    const read = async () => video;
    const expected = await inspectionSourceIdentity(bytes, stored, read);
    const input = { bytes, stored, expected, origin: { tryId: stored.id, frame: 1, seconds: 0.02 } };

    expect(await restoreInspectionSource(input, read)).toEqual(recording);
    video[0] = 2;
    await expect(restoreInspectionSource(input, read)).rejects.toThrow('unavailable');
    video[0] = 1;

    const changed = encodeRecording({ ...recording, ctrl: new Float32Array([1, 0]) });

    await expect(restoreInspectionSource({ ...input, bytes: changed }, read)).rejects.toThrow('unavailable');
    await expect(restoreInspectionSource({ ...input, origin: { ...input.origin, seconds: 1 } }, read)).rejects.toThrow(
      'unavailable',
    );
    await expect(inspectionSourceIdentity(new Uint8Array(), stored, read)).rejects.toThrow('unavailable');
  });
});
