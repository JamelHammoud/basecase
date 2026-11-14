import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../cases/tryFile';
import type { TryLabels } from '../cases/tryLabels';
import { importedTouch } from '../datasets/labelFixtures';
import { labelPass, type LabelContext, type SegmentRequest } from './tryLabelPass';

let touch: Awaited<ReturnType<typeof importedTouch>>;

beforeAll(async () => {
  touch = await importedTouch(await loadMujoco());
}, 60000);

const contextOf = (cases = [touch.kase]): LabelContext => ({
  model: touch.model,
  rig: touch.rig,
  parts: touch.robot.parts,
  cases,
  partners: () => [],
});

const segmenter = () =>
  vi.fn((request: SegmentRequest) =>
    Promise.resolve([
      { from: 0, to: 40, label: 'idle' },
      { from: 40, to: request.recording.frames, label: 'reach' },
    ]),
  );

describe('the label pass', () => {
  it('fills a try’s labels once, by rule, from the segmenter and the quality flags', async () => {
    const segment = segmenter();
    const once = await labelPass(touch.stored, touch.recording, contextOf([]), { segment });
    const twice = await labelPass(once, touch.recording, contextOf([]), { segment });

    expect(once.labels).toMatchObject({ by: 'rule', tags: [], segments: [{ label: 'idle' }, { label: 'reach' }] });
    expect(once.labels?.flags.some((f) => f.kind === 'model')).toBe(false);
    expect(segment).toHaveBeenCalledTimes(1);
    expect(segment.mock.calls[0][0]).toMatchObject({ kind: 'real', model: touch.model, kase: null });
    expect(twice).toBe(once);
  });

  it('leaves segments a person made', async () => {
    const labels: TryLabels = {
      segments: [{ from: 0, to: 10, label: 'wave' }],
      by: 'person',
      tags: ['mine'],
      flags: [],
    };
    const mine: StoredTry = { ...touch.stored, labels, outcome: { verdict: 'failed', margin: null, by: 'person' } };
    const segment = segmenter();

    expect(await labelPass(mine, touch.recording, contextOf(), { segment })).toBe(mine);
    expect(segment).not.toHaveBeenCalled();
  });

  it('segments a tagged try that has no segments, and keeps its tags and instruction', async () => {
    const labels: TryLabels = {
      segments: [],
      by: 'rule',
      tags: ['left', 'slow'],
      flags: [],
      instruction: 'Touch each dot',
    };
    const tagged: StoredTry = { ...touch.stored, labels };
    const segment = segmenter();
    const done = await labelPass(tagged, touch.recording, contextOf([]), { segment });

    expect(done.labels).toMatchObject({ by: 'rule', tags: ['left', 'slow'], instruction: 'Touch each dot' });
    expect(done.labels?.segments.map((s) => s.label)).toEqual(['idle', 'reach']);
    expect(segment).toHaveBeenCalledTimes(1);
  });

  it('leaves a try alone when its segmenter still finds nothing', async () => {
    const empty = vi.fn(() => Promise.resolve([]));
    const once = await labelPass(touch.stored, touch.recording, contextOf([]), { segment: empty });

    expect(once.labels?.segments).toEqual([]);
    expect(await labelPass(once, touch.recording, contextOf([]), { segment: empty })).toBe(once);
  });

  it('judges an unjudged try with the Case that fits it', async () => {
    const segment = segmenter();
    const done = await labelPass(touch.stored, touch.recording, contextOf(), { segment });

    expect(done.outcome).toMatchObject({ verdict: 'passed', by: 'contract' });
    expect(segment.mock.calls[0][0].kase?.task.probes).toHaveLength(touch.kase.task.probes.length);
  });

  it('keeps a Case try’s verdict', async () => {
    const caseTry: StoredTry = {
      ...touch.stored,
      source: 'case',
      case: { id: touch.kase.id, name: touch.kase.name, hash: 'h' },
      outcome: { verdict: 'failed', margin: -2 },
    };
    const done = await labelPass(caseTry, touch.recording, contextOf(), { segment: segmenter() });

    expect(done.outcome).toEqual(caseTry.outcome);
    expect(done.labels?.by).toBe('rule');
  });

  it('flags a try from another model and neither segments nor judges against it', async () => {
    const other: StoredTry = { ...touch.stored, robot: { ...touch.stored.robot, modelHash: 'another' } };
    const segment = segmenter();
    const done = await labelPass(other, touch.recording, contextOf(), { segment });

    expect(done.outcome.verdict).toBe('unjudged');
    expect(done.labels?.flags[0]).toEqual({ kind: 'model', at: 0 });
    expect(segment.mock.calls[0][0].model).toBeNull();
  });

  it('segments by rule through the segmenter when none is given', async () => {
    const done = await labelPass(touch.stored, touch.recording, contextOf([]));
    const segments = done.labels?.segments ?? [];

    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].from).toBe(0);
    expect(segments.at(-1)?.to).toBe(touch.recording.frames);
  });

  it('keeps no labels when the segmenter fails, so a later pass tries again', async () => {
    const segment = vi.fn(() => Promise.reject(new Error('gone')));
    const done = await labelPass(touch.stored, touch.recording, contextOf([]), { segment });

    expect(done).toBe(touch.stored);
  });
});
