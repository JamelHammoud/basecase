import { expect, it } from 'vitest';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { encodeRecording } from './recordingFile';
import { storedTryOf, type StoredTry } from './tryFile';
import type { KeptTry } from './tryStore';
import { exportTryArchive, importTryArchive } from './tryArchive';
import { decodeTryArchive, encodeTryArchive } from './tryArchiveJobs';
import type { Recording } from '../sim/recorder';

function fixture() {
  const recording: Recording = {
    frames: 4,
    dt: 0.02,
    nq: 1,
    nv: 1,
    nu: 1,
    nbody: 1,
    t: Float32Array.from([0, 0.02, 0.04, 0.06]),
    qpos: Float64Array.from([0, 1, 2, 3]),
    qvel: new Float32Array(4),
    ctrl: new Float32Array(4),
    poses: new Float32Array(28),
  };
  const record = {
    id: 'parent',
    caseId: 'case',
    robot: 'Arm',
    at: '2026-11-20T00:00:00.000Z',
    passed: false,
    margin: -1,
    seconds: 0.08,
    manifest: {
      formatVersion: 1 as const,
      caseHash: 'a'.repeat(64),
      modelHash: 'b'.repeat(64),
      seed: 0,
      frames: 4,
      dt: 0.02,
    },
  };
  const context = { sceneId: 'scene', caseName: 'Case', joints: ['joint'], input: 'script' };
  const parent = storedTryOf(record, context);
  const child = storedTryOf(
    {
      ...record,
      id: 'child',
      manifest: {
        ...record.manifest,
        source: parent.id,
        branch: { version: 1, checkpoint: 'c'.repeat(64), frame: 1, time: 0.02 },
      },
    },
    { ...context, input: null },
  );
  const changed = { ...recording, qpos: Float64Array.from([0, 1, -2, -3]) };
  const manifests = new Map<string, StoredTry>([
    [parent.id, parent],
    [child.id, child],
  ]);
  const bytes = new Map([
    [parent.id, encodeRecording(recording)],
    [child.id, encodeRecording(changed)],
  ]);
  const ports = {
    manifests: async (ids: string[]) => ids.flatMap((id) => manifests.get(id) ?? []),
    bytes: async (id: string) => bytes.get(id) ?? null,
    keep: async (tries: KeptTry[]) => {
      for (const t of tries) {
        manifests.set(t.stored.id, t.stored);
        bytes.set(t.stored.id, encodeRecording(t.recording!));
      }
    },
  };

  return { recording, parent, child, manifests, bytes, ports };
}

it('exports branch ancestry using ordinary try files and restores original identities and source bytes through the shared store', async () => {
  const { child, parent, bytes, manifests, ports } = fixture();
  const source = bytes.get(parent.id)!.slice();
  const archive = await exportTryArchive(child.id, ports);
  const decoded = decodeTryArchive(archive);

  expect(decoded.map((e) => e.stored.id)).toEqual([child.id, parent.id]);
  manifests.clear();
  bytes.clear();
  await importTryArchive(archive, ports);
  expect(manifests.get(child.id)!.sourceTry).toBe(parent.id);
  expect(manifests.get(child.id)!.branch).toEqual(child.branch);
  expect(bytes.get(parent.id)).toEqual(source);
  await importTryArchive(archive, ports);
  expect(manifests.size).toBe(2);
  manifests.delete(parent.id);
  bytes.delete(parent.id);

  const orphan = await exportTryArchive(child.id, ports);

  expect(decodeTryArchive(orphan)[0].stored.sourceTry).toBe(parent.id);
  await importTryArchive(archive, ports);
  expect(bytes.get(parent.id)).toEqual(source);
  bytes.set(parent.id, new Uint8Array([1]));
  await expect(importTryArchive(archive, ports)).rejects.toThrow('differs');
  expect(bytes.get(parent.id)).toEqual(new Uint8Array([1]));
});

it('refuses malformed recording bytes, traversal, conflicting ids and nonfinite samples before persistence', async () => {
  const { child, recording, ports } = fixture();
  const json = new TextEncoder().encode(JSON.stringify(child));
  const paths: Record<string, Uint8Array>[] = [
    { '../tries/child/try.json': json },
    { 'tries/other/try.json': json, 'tries/child/recording.bin': encodeRecording(recording) },
    { 'tries/child/try.json': json, 'tries/child/recording.bin': new Uint8Array([0, 1]) },
    {
      'tries/child/try.json': json,
      'tries/child/recording.bin': encodeRecording({ ...recording, qpos: Float64Array.from([0, 1, NaN, 3]) }),
    },
  ];

  for (const files of paths) await expect(importTryArchive(zipSync(files), ports)).rejects.toThrow();

  expect(() => encodeTryArchive([{ stored: { ...child, id: 'CON' }, bytes: encodeRecording(recording) }])).toThrow();
});

it('refuses cyclic ancestry, oversized manifests and declared zip expansion before writing any try', async () => {
  const { child, parent, manifests, bytes, ports } = fixture();

  manifests.set(parent.id, { ...parent, sourceTry: child.id });
  await expect(exportTryArchive(child.id, ports)).rejects.toThrow();

  const keep = ports.keep;
  let writes = 0;

  ports.keep = async (given) => {
    writes++;
    await keep(given);
  };

  const oversized = zipSync({
    'tries/child/try.json': new TextEncoder().encode(JSON.stringify({ ...child, extra: 'x'.repeat(300_000) })),
    'tries/child/recording.bin': bytes.get(child.id)!,
  });

  await expect(importTryArchive(oversized, ports)).rejects.toThrow();

  const bomb = zipSync({ 'tries/child/try.json': new Uint8Array([1]) }, { level: 0 });
  const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);

  for (let at = 0; at < bomb.length - 28; at++) {
    if (view.getUint32(at, true) === 0x02014b50) view.setUint32(at + 24, 601 * 1024 * 1024, true);
  }

  await expect(importTryArchive(bomb, ports)).rejects.toThrow('under');
  expect(writes).toBe(0);
});
