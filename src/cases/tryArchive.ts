import { decodeSceneFile } from '../utils/sceneFile';
import type { StoredTry } from './tryFile';
import type { KeptTry } from './tryStore';
import { keepTries, loadManifests, loadRecordingBytes } from './tryStore';
import { tryArchiveWorker } from './tryArchiveClient';
import { MAX_UNPACKED_BYTES } from '../utils/robotImport/archive';
import {
  MAX_PORTABLE_TRIES,
  TRY_FILE_CONFLICT,
  TRY_FILE_ERROR,
  TRY_FILE_LIMIT,
  type PortableTry,
} from './tryArchiveJobs';

interface Ports {
  manifests: (ids: string[]) => Promise<StoredTry[]>;
  bytes: (id: string) => Promise<Uint8Array | null>;
  keep: (tries: KeptTry[]) => Promise<void>;
}

const PORTS: Ports = { manifests: loadManifests, bytes: loadRecordingBytes, keep: keepTries };

export async function exportTryArchive(id: string, ports: Ports = PORTS): Promise<Uint8Array> {
  const entries: PortableTry[] = [];
  const seen = new Set<string>();
  let current: string | null = id;
  let total = 0;

  while (current) {
    if (seen.has(current) || entries.length >= MAX_PORTABLE_TRIES) throw new Error(TRY_FILE_ERROR);

    seen.add(current);

    const stored: StoredTry | undefined = (await ports.manifests([current]))[0];

    if (!stored && entries.length) break;

    const bytes = stored && (await ports.bytes(stored.id));

    if (!stored || !bytes) throw new Error(TRY_FILE_ERROR);

    total += bytes.byteLength;

    if (total > MAX_UNPACKED_BYTES) throw new Error(TRY_FILE_LIMIT);

    entries.push({ stored, bytes });
    current = stored.sourceTry;
  }

  return tryArchiveWorker.call('encode', entries);
}

export async function importTryArchive(bytes: Uint8Array, ports: Ports = PORTS) {
  const entries = await tryArchiveWorker.call('decode', bytes);

  for (const entry of entries) if (entry.recording.evaluation) await decodeSceneFile(entry.recording.evaluation.scene);

  const existing = new Map(
    (await ports.manifests(entries.map((entry) => entry.stored.id))).map((stored) => [stored.id, stored]),
  );
  const additions: KeptTry[] = [];

  for (const entry of entries) {
    const stored = existing.get(entry.stored.id);
    const previous = stored ? await ports.bytes(stored.id) : null;
    const matches =
      !stored ||
      (await tryArchiveWorker.call('matches', { stored, incoming: entry.stored, bytes: previous, hash: entry.hash }));

    if (!matches) throw new Error(TRY_FILE_CONFLICT);

    if (!stored || !previous) additions.push({ stored: entry.stored, recording: entry.recording });
  }

  if (additions.length) await ports.keep(additions);

  return entries;
}

export const isTryArchiveName = (name: string) => /\.tries\.zip$/i.test(name);
