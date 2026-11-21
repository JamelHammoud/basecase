import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it, vi } from 'vitest';
import { bodyAnalysisScenario } from '../reality/bodyAnalysisMatrix.fixtures';
import { parkedBodyRun } from '../reality/bodyMotion.fixtures';
import { analyzeBody } from '../reality/bodyAnalysis';
import { prepareBodySequence, advanceBodySequence } from '../reality/bodySequence';
import {
  rememberBodyEvidence,
  readBodyEvidence,
  type BodyEvidencePorts,
  type BodyEvidenceSnapshot,
} from '../reality/bodyEvidence';
import { retainSequenceObservation, bodySequenceSession } from '../reality/bodySequenceRecording';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import { canonicalJson, sha256Hex } from '../skills/hash';
import { sha256 } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import { runBodySequenceEvidence, sequenceRecordingsCurrent } from './bodySequenceAction';

let mj: MainModule;
let original: BodyEvidenceSnapshot;

beforeAll(async () => {
  mj = await loadMujoco();

  const { request } = await bodyAnalysisScenario(mj, 'coupled wrist');

  request.run = parkedBodyRun(request.model);

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  original = {
    request,
    result,
    sourceKey: 'source-key',
    calibration: {},
    sessionHash: await sha256(bodySequenceSession(request.run)),
  };
});

async function harness() {
  const content = new Map<string, Uint8Array>();
  const sessions = new Map<string, string>();
  const manifests = new Map<string, StoredTry>();
  const encode = async (value: unknown) => new TextEncoder().encode(canonicalJson(value));
  const storage: BodyEvidencePorts = {
    encode,
    decode: async (bytes) => JSON.parse(new TextDecoder().decode(bytes)),
    save: async (bytes) => {
      const key = sha256Hex(bytes);

      content.set(key, bytes.slice());

      return key;
    },
    load: async (key) => content.get(key) ?? null,
  };
  const remember = (snapshot: BodyEvidenceSnapshot) => rememberBodyEvidence(snapshot, storage);
  const source = await remember(structuredClone(original));
  const session = bodySequenceSession(original.request.run);
  const stored = {
    id: source.recording,
    source: 'operate',
    sceneId: source.scene,
    robot: { modelHash: source.modelHash, joints: source.joints },
  } as StoredTry;

  sessions.set(source.recording, session);
  manifests.set(source.recording, stored);

  const unchanged = (ref: typeof source) =>
    bodyRecordingUnchanged(ref, {
      manifests: async (ids) => ids.flatMap((id) => manifests.get(id) ?? []),
      session: async (id) => sessions.get(id) ?? null,
    });
  const ports = {
    read: (ref: typeof source) => readBodyEvidence(ref, storage),
    remember,
    unchanged,
    encode,
    observation: (input: Parameters<typeof retainSequenceObservation>[0]) =>
      retainSequenceObservation(input, {
        encode,
        remember,
        keep: async (manifest, text) => {
          manifests.set(manifest.id, manifest);
          sessions.set(manifest.id, text);
        },
      }),
  };
  const worker = {
    prepareSequence: vi.fn((input: Parameters<typeof prepareBodySequence>[0]) => prepareBodySequence(input, { mj })),
    advanceSequence: vi.fn(
      (input: { request: typeof original.request; sequence: Awaited<ReturnType<typeof prepareBodySequence>> }) =>
        advanceBodySequence(input.request, input.sequence, { mj }),
    ),
    dispose: vi.fn(),
  };
  const controller = new AbortController();
  const retain = vi.fn();
  const action = {
    reference: source,
    selected: original.result!.parameters.map((_, index) => index),
    worker,
    signal: controller.signal,
    current: () => true,
    retain,
  };

  return { action, ports, storage, sessions, content, controller, retain, source };
}

it('keeps two original recordings on Stop and reopens the exact retained graph without running more physics', async () => {
  const h = await harness();

  h.retain.mockImplementation((_reference, evidence) => {
    if (evidence.state.rounds.length === 2) h.controller.abort();
  });

  const evidence = await runBodySequenceEvidence(h.action, h.ports);

  expect(evidence?.state.rounds).toHaveLength(2);
  expect(evidence?.state.reason).toBe('cancelled');
  expect(h.action.worker.advanceSequence).toHaveBeenCalledTimes(2);
  expect(h.action.worker.dispose).toHaveBeenCalled();

  const last = h.retain.mock.calls.at(-1)!;
  const restored = await h.ports.read(last[0]);

  expect(restored?.sequence).toEqual(evidence);
  expect(evidence?.recordings).toHaveLength(3);
  expect(evidence!.retainedBytes).toBeLessThanOrEqual(evidence!.state.limits.retainedBytes);
  expect(await sequenceRecordingsCurrent(evidence!, h.ports.unchanged)).toBe(true);
  expect((await h.ports.read(h.source))?.sequence).toBeUndefined();
  expect(h.action.worker.advanceSequence).toHaveBeenCalledTimes(2);

  const recording = evidence!.recordings[1];
  const observation = await h.ports.read(recording);

  expect(observation?.request.run).toEqual(evidence!.state.rounds[0].run);
  h.sessions.delete(recording.recording);
  expect(await sequenceRecordingsCurrent(evidence!, h.ports.unchanged)).toBe(false);

  const corrupted = structuredClone(restored!);

  corrupted.sequence!.state.rounds[0].run.statuses[1].positions[0]! += 0.1;
  h.content.set(last[0].content, await h.ports.encode(corrupted));
  expect(await h.ports.read(last[0])).toBeNull();
});

it('refuses missing source bytes and rejects replies after a scene or source change', async () => {
  const missing = await harness();

  missing.sessions.clear();
  expect(await runBodySequenceEvidence(missing.action, missing.ports)).toBeNull();
  expect(missing.action.worker.prepareSequence).not.toHaveBeenCalled();

  const stale = await harness();
  let current = true;

  stale.action.current = () => current;
  stale.action.worker.advanceSequence.mockImplementationOnce(async (input) => {
    const next = await advanceBodySequence(input.request, input.sequence, { mj });

    current = false;

    return next;
  });

  const evidence = await runBodySequenceEvidence(stale.action, stale.ports);

  expect(evidence?.state.rounds).toHaveLength(0);
  expect(evidence?.state.reason).toBeNull();
  expect(stale.retain).toHaveBeenCalledTimes(1);
  expect((await stale.ports.read(stale.retain.mock.calls[0][0]))?.sequence?.state.rounds).toHaveLength(0);
});
