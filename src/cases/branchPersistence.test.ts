import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { TryStore } from '../../electron/library/tryStore.mjs';
import type { Recording } from '../sim/recorder';
import { branchRecording } from './branchRecording';
import { decodeRecording, encodeRecording } from './recordingFile';
import { readStoredTry, storedTryOf, summaryRecord, tryRecordOf, type TrySummary } from './tryFile';
import type { TryRecord } from './tries';

const fileBytes = (store: TryStore, id: string) => Uint8Array.from(store.recording(id)!);

function samples(frames: number, offset = 0): Recording {
  return {
    frames,
    dt: 0.02,
    nq: 1,
    nv: 1,
    nu: 1,
    nbody: 1,
    t: Float32Array.from({ length: frames }, (_, i) => i * 0.02),
    ctrl: new Float32Array(frames).fill(offset),
    qpos: Float64Array.from({ length: frames }, (_, i) => offset + i * 0.1),
    qvel: new Float32Array(frames).fill(1),
    poses: new Float32Array(frames * 7),
  };
}

it('keeps branch identity and source bytes through real store reopening, portable folders and a missing parent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'continuation-store-'));
  const open = (folder: string) =>
    new TryStore({
      triesDir: path.join(dir, folder, 'tries'),
      cacheFile: path.join(dir, folder, 'index.json'),
    });
  const store = open('source');
  const source = samples(61);
  const recording = branchRecording({ source, checkpoint: { frame: 50, time: 1 }, suffix: samples(11, -1) })!;
  const parent: TryRecord = {
    id: 'source-try',
    caseId: 'case',
    robot: 'Arm',
    at: '2026-11-20T00:00:00.000Z',
    passed: false,
    margin: -1,
    seconds: source.frames * source.dt,
    manifest: {
      formatVersion: 1,
      caseHash: 'a'.repeat(64),
      modelHash: 'b'.repeat(64),
      seed: 0,
      frames: source.frames,
      dt: source.dt,
    },
  };
  const child: TryRecord = {
    ...parent,
    id: 'branch-try',
    manifest: {
      ...parent.manifest,
      source: parent.id,
      branch: { version: 1, checkpoint: 'c'.repeat(64), frame: 50, time: 1 },
    },
  };
  const context = { sceneId: 'scene', caseName: 'Case', joints: ['joint'], input: null };
  const unchanged = encodeRecording(source);

  try {
    store.save({ manifest: storedTryOf(parent, context), recording: unchanged });
    store.save({ manifest: storedTryOf(child, context), recording: encodeRecording(recording) });

    const reopened = open('source');
    const portable = open('portable');

    for (const manifest of reopened.manifests([parent.id, child.id]))
      portable.save({
        manifest: JSON.parse(JSON.stringify(manifest)),
        recording: reopened.recording(String(manifest.id)),
      });

    const copied = open('portable');
    const saved = readStoredTry(copied.manifests([child.id])[0])!;
    const resumed = decodeRecording(fileBytes(copied, child.id))!;

    expect(saved.sourceTry).toBe(parent.id);
    expect(saved.branch).toEqual(child.manifest.branch);
    expect(tryRecordOf(saved).manifest.branch).toEqual(child.manifest.branch);
    expect(
      summaryRecord(copied.list().find((s) => s.id === child.id) as unknown as TrySummary).manifest.branch,
    ).toEqual(child.manifest.branch);
    expect(fileBytes(copied, parent.id)).toEqual(unchanged);
    expect(resumed.qpos.subarray(0, 51)).toEqual(source.qpos.subarray(0, 51));
    expect(resumed.qpos.subarray(51)).not.toEqual(source.qpos.subarray(51));
    copied.delete([parent.id]);
    expect(copied.recording(parent.id)).toBeNull();
    expect(readStoredTry(open('portable').manifests([child.id])[0])?.sourceTry).toBe(parent.id);
    expect(fileBytes(open('portable'), child.id)).toEqual(encodeRecording(recording));
    expect(fileBytes(reopened, parent.id)).toEqual(unchanged);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
