import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { bodyMotionPreview } from './bodyMotionPreview';
import { bodyMotionPlans } from './bodyMotionPlans';
import { BODY_MOTION_METHOD } from './bodyMotionTypes';
import type { BodyMotionOutcome } from './bodyMotionTypes';
import { readBodyEvidence, rememberBodyEvidence, type BodyEvidenceSnapshot } from './bodyEvidence';
import { canonicalJson } from '../skills/hash';

let snapshot: BodyEvidenceSnapshot;
let motion: Extract<BodyMotionOutcome, { kind: 'recommended' }>;

beforeAll(async () => {
  const mj = await loadMujoco();
  const { request } = await bodyAnalysisScenario(mj, 'single-link arm');
  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const plan = bodyMotionPlans(request)[0];
  const score = { before: 0, after: 10, gain: 10, resolved: true, directions: result.directions };

  snapshot = {
    request,
    result,
    calibration: { active: 2 },
    sourceKey: 'physical-source',
    sessionHash: 'retained-session',
  };
  motion = {
    kind: 'recommended',
    method: BODY_MOTION_METHOD,
    selected: [0],
    candidates: [{ plan, score }],
    physicsSteps: 1000,
    plan,
    score,
    preview: bodyMotionPreview({
      input: { request, result, selected: [0] },
      plan,
      mj,
      budget: { remainingSteps: 10000 },
    }),
  };
});

function storage() {
  const entries = new Map<string, Uint8Array>();
  const ports = {
    encode: async (value: unknown) => new TextEncoder().encode(canonicalJson(value)),
    decode: async (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    save: async (bytes: Uint8Array) => {
      const key = String(entries.size);

      entries.set(key, bytes.slice());

      return key;
    },
    load: async (key: string) => entries.get(key) ?? null,
  };

  return { ports, entries };
}

describe('motion snapshots in the existing evidence store', () => {
  it('reopens a legacy analysis and the complete retained preview without searching or current inputs', async () => {
    const { ports } = storage();
    const legacy = await rememberBodyEvidence(snapshot, ports);
    const original = structuredClone(snapshot);
    const saved = { ...snapshot, motion: structuredClone(motion) };
    const ref = await rememberBodyEvidence(saved, ports);

    saved.request = { ...snapshot.request, source: { ...snapshot.request.source, unit: 'another-unit' } };
    saved.motion.preview.positions[0][0] = 999;
    expect(await readBodyEvidence(legacy, ports)).toEqual(original);
    expect(await readBodyEvidence(ref, ports)).toEqual({ ...original, motion });
    expect(snapshot).toEqual(original);
    expect(await readBodyEvidence({ ...ref, unit: 'another-unit' }, ports)).toBeNull();
  });

  it.each(['json', 'method', 'selection', 'plan', 'preview', 'score', 'poses', 'geometry', 'units'])(
    'refuses corrupt %s without replacing historical evidence',
    async (field) => {
      const { ports, entries } = storage();
      const ref = await rememberBodyEvidence({ ...snapshot, motion }, ports);
      const malformed = structuredClone(motion);
      const corruptions: Record<string, () => void> = {
        method: () => Object.assign(malformed.method, { version: 'unknown' }),
        selection: () => {
          malformed.selected = [99];
        },
        plan: () => {
          malformed.plan.run.intents[1].joints[0] = 999;
        },
        preview: () => {
          malformed.preview.positions = [];
        },
        score: () => {
          malformed.score.after = Infinity;
        },
        poses: () => {
          malformed.preview.poses[0] = [];
        },
        geometry: () => {
          malformed.preview.parts[0].mesh!.positions[0] = Infinity;
        },
        units: () => {
          malformed.preview.units[0] = 'm';
        },
      };

      corruptions[field]?.();
      entries.set(
        ref.content,
        field === 'json' ? new TextEncoder().encode('{') : await ports.encode({ ...snapshot, motion: malformed }),
      );
      expect(await readBodyEvidence(ref, ports)).toBeNull();
    },
  );
});
