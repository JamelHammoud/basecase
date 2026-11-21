import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { recommendBodyMotion } from './bodyMotion';
import { parkedBodyRun } from './bodyMotion.fixtures';
import {
  readBodyEvidence,
  readBodyEvidenceContent,
  rememberBodyEvidence,
  type BodyEvidenceSnapshot,
} from './bodyEvidence';
import { retainBodyExperiment } from './bodyExperimentEvidence';
import { bodyClient } from './bodyClient';
import { canonicalJson } from '../skills/hash';
import { sha256 } from '../cases/tries';
import { readStoredTry, type StoredTry } from '../cases/tryFile';

let original: BodyEvidenceSnapshot;

beforeAll(async () => {
  const mj = await loadMujoco();
  const { request } = await bodyAnalysisScenario(mj, 'single-link arm');

  request.run = parkedBodyRun(request.model);

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const motion = await recommendBodyMotion({ request, result, selected: [0] }, { mj });

  if (motion.kind !== 'recommended') throw new Error(motion.kind);

  original = { request, result, motion, calibration: {}, sourceKey: 'b'.repeat(64) };
});

function storage() {
  const bytes = new Map<string, Uint8Array>();
  const ports = {
    encode: async (value: unknown) => new TextEncoder().encode(canonicalJson(value)),
    decode: async (value: Uint8Array) => JSON.parse(new TextDecoder().decode(value)) as unknown,
    save: async (value: Uint8Array) => {
      const hash = await sha256(new TextDecoder().decode(value));

      bytes.set(hash, value.slice());

      return hash;
    },
    load: async (hash: string) => bytes.get(hash) ?? null,
  };

  return {
    bytes,
    ports,
    read: (ref: Parameters<typeof readBodyEvidence>[0]) => readBodyEvidence(ref, ports),
    remember: (value: BodyEvidenceSnapshot) => rememberBodyEvidence(value, ports),
    client: bodyClient,
  };
}

it.each([
  ['completed', true, 2],
  ['cancelled', true, 0.08],
  ['cancelled', false, 0],
] as const)(
  'reopens exact recommendations and actual %s observations with commands %s without current scene inputs',
  async (completion, commandsPresent, seconds) => {
    const store = storage();
    const recommendation = await store.remember(original);
    const bodyMotion = {
      version: 1 as const,
      recommendation: recommendation.content,
      sourceKey: original.sourceKey,
      connection: '00000000-0000-0000-0000-000000000000',
      revision: 1,
      completion,
      backend: 'servo-independent-1' as const,
    };
    const stored: StoredTry = {
      version: 1,
      id: `observed-${completion}`,
      sceneId: recommendation.scene,
      robot: { name: 'Arm', modelHash: recommendation.modelHash, joints: recommendation.joints },
      case: null,
      source: 'operate',
      input: null,
      startedAt: new Date(0).toISOString(),
      seconds,
      frames: completion === 'completed' ? 20 : 0,
      rate: 10,
      seed: 0,
      sourceTry: null,
      faults: [],
      outcome: { verdict: 'unjudged', margin: null },
      bodyMotion,
    };
    const lines = [{ k: 'motion', t: 0, ...bodyMotion }];
    const statuses =
      completion === 'completed'
        ? Array.from({ length: 20 }, (_, frame) => ({
            k: 'status',
            t: (frame + 1) / 10,
            q: recommendation.joints.map(() => frame / 10000),
          }))
        : [];
    const commands = (commandsPresent ? [0.025, 0.05, 0.075] : []).map((t) => ({
      k: 'intent',
      t,
      q: recommendation.joints.map(() => t / 10),
    }));
    const session =
      [...lines, ...commands, ...statuses, { k: 'motion-end', t: stored.seconds, completion }]
        .map((line) => JSON.stringify(line))
        .join('\n') + '\n';
    const accepted = readStoredTry(JSON.parse(JSON.stringify(stored)));

    expect(accepted).not.toBeNull();

    const reference = await retainBodyExperiment({ recommendation, stored: accepted!, session }, store);

    expect(reference).not.toBeNull();

    const reopened = await store.read(reference!);
    const source = await readBodyEvidenceContent(reopened!.experiment!.recommendation.content, store.ports);

    expect(source?.snapshot).toEqual(original);
    expect(reopened?.experiment?.recording.completion).toBe(completion);
    expect(reopened?.refusal).toBe('backend');
    expect(reopened?.result).toBeUndefined();
    expect(reopened?.request.run.statuses.map((status) => status.positions)).toEqual(
      statuses.map((status) => status.q),
    );
    expect(reopened?.request.run.intents).toEqual(
      commands.map((command) => ({ at: command.t * 1000, joints: command.q })),
    );
    expect(reopened?.sessionHash).toBe(await sha256(session));
    expect((await store.read(recommendation))?.motion).toEqual(original.motion);
    expect(
      await retainBodyExperiment(
        {
          recommendation,
          stored: { ...stored, bodyMotion: { ...bodyMotion, recommendation: 'f'.repeat(64) } },
          session,
        },
        store,
      ),
    ).toBeNull();
    await expect(
      retainBodyExperiment(
        { recommendation, stored, session },
        {
          ...store,
          remember: async () => {
            throw new Error('store failed');
          },
        },
      ),
    ).rejects.toThrow('store failed');
    expect((await store.read(recommendation))?.motion).toEqual(original.motion);
  },
);
