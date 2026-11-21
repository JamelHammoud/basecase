import fs from 'node:fs';
import path from 'node:path';
import { TryStore } from '../../electron/library/tryStore.mjs';
import { DatasetStore } from '../../electron/library/datasetStore.mjs';
import { canonicalJson } from '../skills/hash';
import {
  rememberBodyEvidence,
  readBodyEvidence,
  type BodyEvidencePorts,
  type BodyEvidenceSnapshot,
} from './bodyEvidence';
import { bodySequenceSession, retainSequenceObservation } from './bodySequenceRecording';
import { bodyRecordingUnchanged } from './bodyRecordingIdentity';
import { sha256 } from '../cases/tries';
import { readStoredTry, type StoredTry } from '../cases/tryFile';

function directoryBytes(directory: string): number {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, item) => {
    const file = path.join(directory, item.name);

    return sum + (item.isDirectory() ? directoryBytes(file) : fs.statSync(file).size);
  }, 0);
}

export async function bodySequenceDisk(snapshot: BodyEvidenceSnapshot) {
  const parent = path.join('scratch', 'body-sequence-cost');

  fs.mkdirSync(parent, { recursive: true });

  const directory = fs.mkdtempSync(path.join(parent, 'run-'));
  const tries = new TryStore({
    triesDir: path.join(directory, 'tries'),
    cacheFile: path.join(directory, 'cache.json'),
    indexFile: path.join(directory, 'index.json'),
  });
  const datasets = new DatasetStore({ dir: path.join(directory, 'datasets') });
  const encode = async (value: unknown) => new TextEncoder().encode(canonicalJson(value));
  const storage: BodyEvidencePorts = {
    encode,
    decode: async (bytes) => JSON.parse(new TextDecoder().decode(bytes)),
    save: async (bytes) => datasets.saveContent(bytes),
    load: async (hash) => datasets.content(hash),
  };
  const remember = (value: BodyEvidenceSnapshot) => rememberBodyEvidence(value, storage);
  const session = bodySequenceSession(snapshot.request.run);
  const source = await remember({ ...snapshot, generated: true, sessionHash: await sha256(session) });
  const manifest: StoredTry = {
    version: 1,
    id: source.recording,
    sceneId: source.scene,
    robot: { name: snapshot.request.robot, modelHash: source.modelHash, joints: source.joints },
    source: 'generated',
    case: null,
    input: null,
    startedAt: '2026-11-21T00:00:00Z',
    seconds: snapshot.request.run.statuses.at(-1)!.at / 1000,
    frames: snapshot.request.run.statuses.length,
    rate: 32,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
  };

  tries.save({ manifest, session: new TextEncoder().encode(session) });

  const unchanged = (reference: typeof source) =>
    bodyRecordingUnchanged(reference, {
      manifests: async (ids) => tries.manifests(ids).flatMap((value) => readStoredTry(value) ?? []),
      session: async (id) => {
        const bytes = tries.session(id);

        return bytes ? new TextDecoder().decode(bytes) : null;
      },
    });

  return {
    source,
    ports: {
      read: (reference: typeof source) => readBodyEvidence(reference, storage),
      remember,
      unchanged,
      encode,
      observation: (input: Parameters<typeof retainSequenceObservation>[0]) =>
        retainSequenceObservation(input, {
          encode,
          remember,
          keep: async (stored, text) => {
            tries.save({ manifest: stored, session: new TextEncoder().encode(text) });
          },
        }),
    },
    bytes: () => directoryBytes(directory),
    close: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}
