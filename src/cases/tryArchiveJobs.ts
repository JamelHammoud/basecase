import { decodeSceneFile } from '../utils/sceneFile';
import type { ScenePart } from '../types/robotics';
import { zipSync, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { KB } from '../../electron/fileSize.mjs';
import { fileSize } from '../../electron/fileSize.mjs';
import { isSafeFileId } from '../../electron/backend/constants.mjs';
import { MAX_ENTRIES, MAX_UNPACKED_BYTES, safeEntryPath, unzipEntries } from '../utils/robotImport/archive';
import { reply } from '../utils/workerRpc';
import { sha256Hex, hashOf } from '../skills/hash';
import { recordingTransfer, type Recording } from '../sim/recorder';
import { readEvaluationReplay, evaluationScenePhysics } from './evaluationReplayValidation';
import { evaluationComponents } from './evaluationAssets';
import { decodeRecording, encodeRecording } from './recordingFile';
import { readStoredTry, type StoredTry } from './tryFile';

export const TRY_FILE_ERROR = 'This try’s files can’t be read.';
export const TRY_FILE_CONFLICT = 'A saved try differs from this file.';
export const TRY_FILE_LIMIT = `Keep the try file under ${fileSize(MAX_UNPACKED_BYTES)}.`;
export const MAX_PORTABLE_TRIES = 128;

const MAX_MANIFEST_BYTES = 256 * KB;

export interface PortableTry {
  stored: StoredTry;
  bytes: Uint8Array;
}

export interface RestoredTry {
  stored: StoredTry;
  recording: Recording;
  hash: string;
}

function checkSize(size: number) {
  if (size > MAX_UNPACKED_BYTES) throw new Error(TRY_FILE_LIMIT);
}

function readManifest(value: unknown): StoredTry {
  const stored = readStoredTry(value);

  if (!stored || !isSafeFileId(stored.id) || !isSafeFileId(stored.sceneId)) throw new Error(TRY_FILE_ERROR);

  if (stored.source !== 'case' || (stored.input !== 'script' && !stored.branch)) throw new Error(TRY_FILE_ERROR);

  return stored;
}

function recordingFits(recording: Recording | null, stored: StoredTry): recording is Recording {
  if (!recording || recording.frames !== stored.frames || Math.abs(1 / recording.dt - stored.rate) > 1e-6) return false;

  const finite = [recording.t, recording.qpos, recording.qvel, recording.ctrl, recording.poses, recording.torque];

  return (
    finite.every((row) => !row || row.every(Number.isFinite)) &&
    recording.t.every((time, i) => time >= 0 && (!i || time > recording.t[i - 1]))
  );
}

function evaluationFits(recording: Recording | null, stored: StoredTry): boolean {
  const source = recording?.evaluation;

  if (!source) return true;

  return (
    source.seed === stored.seed &&
    source.revision === stored.robot.name &&
    source.evaluation === stored.sceneId &&
    sha256Hex(source.model.xml) === stored.robot.modelHash &&
    hashOf(source.kase) === stored.case?.hash &&
    source.model.bodies.length === recording.nbody &&
    source.passed === (stored.outcome.verdict === 'passed') &&
    source.margin === stored.outcome.margin &&
    source.efforts.peaks.length === source.model.joints.length &&
    source.efforts.forces.length === source.model.joints.length &&
    source.trips.every((trip) => trip.frame < recording.frames)
  );
}

export function encodeTryArchive(entries: PortableTry[]): Uint8Array {
  if (!entries.length || entries.length > MAX_PORTABLE_TRIES) throw new Error(TRY_FILE_ERROR);

  const files: Record<string, Uint8Array> = {};
  let size = 0;

  for (const entry of entries) {
    const stored = readManifest(entry.stored);
    const folder = `tries/${stored.id}`;

    if (files[`${folder}/try.json`]) throw new Error(TRY_FILE_ERROR);

    const manifest = new TextEncoder().encode(JSON.stringify(stored));

    size += manifest.byteLength + entry.bytes.byteLength;
    checkSize(size);
    files[`${folder}/try.json`] = manifest;
    files[`${folder}/recording.bin`] = entry.bytes;
  }

  const archive = zipSync(files, { level: 0 });

  checkSize(archive.byteLength);

  return archive;
}

function archiveEntries(bytes: Uint8Array) {
  checkSize(bytes.byteLength);

  const seen = new Set<string>();
  let size = 0;

  unzipSync(bytes, {
    filter: (entry) => {
      if (safeEntryPath(entry.name) !== entry.name || seen.has(entry.name)) throw new Error(TRY_FILE_ERROR);

      seen.add(entry.name);
      size += entry.originalSize;
      checkSize(size);

      if (seen.size > MAX_ENTRIES || (entry.compression === 0 && entry.size !== entry.originalSize))
        throw new Error(TRY_FILE_ERROR);

      return false;
    },
  });

  return new Map(unzipEntries(bytes).map((entry) => [entry.path, entry.data]));
}

export function decodeTryArchive(bytes: Uint8Array): RestoredTry[] {
  const files = archiveEntries(bytes);
  const manifests = [...files].filter(([path]) => /^tries\/[^/]+\/try\.json$/.test(path));

  if (!manifests.length || manifests.length > MAX_PORTABLE_TRIES) throw new Error(TRY_FILE_ERROR);

  return manifests.map(([path, bytes]) => {
    if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error(TRY_FILE_ERROR);

    const stored = readManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    const data = files.get(`tries/${stored.id}/recording.bin`);

    if (path !== `tries/${stored.id}/try.json` || !data) throw new Error(TRY_FILE_ERROR);

    const recording = decodeRecording(data);

    if (!recordingFits(recording, stored) || !evaluationFits(recording, stored)) throw new Error(TRY_FILE_ERROR);

    return { stored, recording, hash: sha256Hex(data) };
  });
}

function decodeChecked(bytes: Uint8Array) {
  try {
    return decodeTryArchive(bytes);
  } catch (error) {
    if (error instanceof Error && error.message === TRY_FILE_LIMIT) throw error;

    throw new Error(TRY_FILE_ERROR, { cause: error });
  }
}

async function checkEvaluationScene(recording: Pick<Recording, 'evaluation'>) {
  const source = recording.evaluation;

  if (!source) return;

  const scene = await decodeSceneFile(source.scene);

  if (evaluationComponents(scene).some((id) => !Object.hasOwn(source.meshes, id))) throw new Error(TRY_FILE_ERROR);
}

export const tryArchiveJobs = {
  evaluationScene: async (input: {
    scene: Uint8Array;
    parts: ScenePart[];
    physics: ReturnType<typeof evaluationScenePhysics>;
  }) => {
    const scene = await decodeSceneFile(input.scene);

    return reply(
      hashOf(scene.parts) === hashOf(input.parts) &&
        hashOf(evaluationScenePhysics(scene.project)) === hashOf(input.physics),
    );
  },
  encodeRecording: (recording: Recording) => {
    const bytes = encodeRecording(recording);

    return reply(bytes, [bytes.buffer]);
  },
  recording: (bytes: Uint8Array) => {
    const recording = decodeRecording(bytes);

    return reply(recording, recording ? recordingTransfer(recording) : []);
  },
  evaluation: async (input: { source: unknown; stored: StoredTry; nbody: number; frames: number }) => {
    const source = readEvaluationReplay(input.source);

    if (
      !source ||
      !evaluationFits({ evaluation: source, nbody: input.nbody, frames: input.frames } as Recording, input.stored)
    )
      throw new Error(TRY_FILE_ERROR);

    await checkEvaluationScene({ evaluation: source });

    return reply(true);
  },
  encode: (entries: PortableTry[]) => {
    const bytes = encodeTryArchive(entries);

    return reply(bytes, [bytes.buffer]);
  },
  decode: async (bytes: Uint8Array) => {
    const restored = decodeChecked(bytes);

    for (const entry of restored) await checkEvaluationScene(entry.recording);

    return reply(
      restored,
      restored.flatMap((entry) => recordingTransfer(entry.recording)),
    );
  },
  matches: (input: { stored: StoredTry; incoming: StoredTry; bytes: Uint8Array | null; hash: string }) =>
    reply(hashOf(input.stored) === hashOf(input.incoming) && (!input.bytes || sha256Hex(input.bytes) === input.hash)),
};
