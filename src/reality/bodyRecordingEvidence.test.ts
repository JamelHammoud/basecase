import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { analysisArmScene } from './bodyAnalysisMatrix.fixtures';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { bodyRecordingContext, retainBodyRecording } from './bodyRecordingEvidence';
import { readBodyEvidence } from './bodyEvidence';
import { bodyRecordingUnchanged } from './bodyRecordingIdentity';
import type { StoredTry } from '../cases/tryFile';

const memory = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('../datasets/datasetStore/content', () => ({
  saveDatasetContent: async (bytes: Uint8Array) => {
    const key = `content-${memory.size}`;

    memory.set(key, bytes.slice());

    return key;
  },
  loadDatasetContent: async (key: string) => memory.get(key) ?? null,
}));

async function fixture() {
  const scene = analysisArmScene();
  const { model } = fixturePackageJob(scene).job;
  const project = { ...DEFAULT_PROJECT, joints: scene.joints };
  const context = await bodyRecordingContext({
    model,
    project,
    parts: scene.parts,
    unit: 'arm-a',
    scene: 'scene-a',
    joints: model.joints.map((joint) => joint.id),
  });

  if (!context) throw new Error('missing generated context');

  const stored: StoredTry = {
    version: 1,
    id: 'arm-run',
    sceneId: 'scene-a',
    robot: { name: 'Arm', modelHash: context.modelHash, joints: model.joints.map((joint) => joint.id) },
    case: null,
    source: 'operate',
    input: null,
    startedAt: '2026-11-20T00:00:00Z',
    seconds: 1.2,
    rate: 20,
    frames: 25,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
  };
  const session = Array.from({ length: 25 }, (_, index) => [
    { t: index * 0.05, k: 'status', q: [index * 0.01, index * 0.02] },
    { t: index * 0.05, k: 'intent', q: [index * 0.02, index * 0.03] },
  ])
    .flat()
    .map((line) => JSON.stringify(line))
    .join('\n');

  return { context, stored, session, project };
}

describe('body evidence binds the existing retained recording contract', () => {
  it('retains exact model, calibration, mapping, interval and unit without rewriting the try', async () => {
    const input = await fixture();
    const before = structuredClone(input.stored);
    const ref = await retainBodyRecording(input);

    expect(ref).not.toBeNull();

    const saved = await readBodyEvidence(ref!);

    expect(input.stored).toEqual(before);
    expect(saved?.request.model).toEqual(input.context.snapshot.request.model);
    expect(saved?.calibration).toEqual(input.context.snapshot.calibration);
    expect(saved?.request.source).toEqual({ ...input.context.snapshot.request.source, recording: 'arm-run' });
    expect(saved?.request.run.joints).toEqual(input.stored.robot.joints);
    expect(saved?.request.run.statuses.at(-1)?.at).toBeCloseTo(1200, 9);
    expect(ref?.sessionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('invalidates edited recording identity and ordered joint mapping', async () => {
    const input = await fixture();
    const ref = (await retainBodyRecording(input))!;
    const ports = (stored = input.stored, session = input.session) => ({
      manifests: async () => [stored],
      session: async () => session,
    });

    expect(await bodyRecordingUnchanged(ref, ports())).toBe(true);

    const variants = [
      { ...input.stored, id: 'other' },
      { ...input.stored, source: 'generated' as const },
      { ...input.stored, sceneId: 'other' },
      { ...input.stored, robot: { ...input.stored.robot, modelHash: 'other' } },
      { ...input.stored, robot: { ...input.stored.robot, joints: [...input.stored.robot.joints].reverse() } },
    ];

    for (const stored of variants) expect(await bodyRecordingUnchanged(ref, ports(stored))).toBe(false);

    expect(await bodyRecordingUnchanged(ref, ports(input.stored, input.session + '\n'))).toBe(false);
  });

  it('refuses missing provenance, model or joint mismatch and corrupted source timestamps', async () => {
    const input = await fixture();
    const variants = [
      { ...input, context: null },
      { ...input, stored: { ...input.stored, robot: { ...input.stored.robot, modelHash: 'other' } } },
      { ...input, stored: { ...input.stored, robot: { ...input.stored.robot, joints: ['other'] } } },
      { ...input, session: input.session + '\n{broken' },
      { ...input, session: input.session.replaceAll('"t":0.05', '"t":0') },
      { ...input, session: input.session.replaceAll('"q":[0.01,0.02]', '"q":["wrong",0.02]') },
    ];

    for (const variant of variants) expect(await retainBodyRecording(variant)).toBeNull();
  });
});
