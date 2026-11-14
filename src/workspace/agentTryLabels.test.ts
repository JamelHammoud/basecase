import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../cases/tryFile';
import type { TryLabels } from '../cases/tryLabels';
import { storedTry } from '../cases/trySearch/fixtures/searchFixtures';
import type { Recording } from '../sim/recorder';
import type { Rig } from '../utils/kinematics';
import { labelTries, type LabelPass, type TryLabelContext } from './agentTryLabels';

const store = vi.hoisted(() => ({ tries: new Map<string, unknown>(), recordings: new Set<string>() }));

vi.mock('./tryLabelPass', () => ({ labelPass: async (stored: unknown) => stored }));

vi.mock('../utils/imageEncode', () => ({
  blobToDataUrl: async (blob: Blob) => `data:${blob.type};base64,${btoa(await blob.text())}`,
}));

vi.mock('../cases/tryStore', () => {
  const loadManifests = async (ids: string[]) => ids.flatMap((id) => (store.tries.get(id) as StoredTry) ?? []);
  const saveLabels = async (given: StoredTry[]) => {
    given.forEach((stored) => store.tries.set(stored.id, stored));

    return given;
  };

  return {
    loadManifests,
    saveLabels,
    editTries: async (ids: string[], edit: (stored: StoredTry) => StoredTry | null) =>
      saveLabels((await loadManifests(ids)).flatMap((stored) => edit(stored) ?? [])),
    loadRecording: async (id: string) => (store.recordings.has(id) ? ({ frames: 600 } as unknown as Recording) : null),
    loadStrip: async (id: string) => (id === 'pick-2' ? new Blob(['strip'], { type: 'image/webp' }) : null),
  };
});

const SEGMENTS = [
  { from: 0, to: 150, label: 'reach' },
  { from: 150, to: 300, label: 'grasp red block' },
  { from: 300, to: 600, label: 'lift red block' },
];

const seeded = (labels: TryLabels): StoredTry => ({
  ...storedTry({ id: 'pick-2', robot: 'SO-101', verdict: 'passed' }),
  labels,
});

const context = (): TryLabelContext => ({
  parts: () => [],
  setAction: () => {},
  cases: { cases: [] },
  tryRead: { model: () => null, rig: () => ({}) as Rig, partners: () => [] },
});

const ruleLabels = (): TryLabels => ({
  segments: SEGMENTS,
  by: 'rule',
  tags: ['demo'],
  flags: [{ kind: 'joint-limit', at: 4.2, joint: 'elbow' }],
});

const passed: LabelPass = vi.fn(async (stored: StoredTry) => ({ ...stored, labels: ruleLabels() }));

beforeEach(() => {
  store.tries.clear();
  store.recordings.clear();
  vi.mocked(passed).mockClear();
  store.tries.set('pick-2', seeded(ruleLabels()));
});

describe('label_tries', () => {
  it('reads a try’s segments, flags, tags and instruction with its filmstrip', async () => {
    const reply = await labelTries({ tries: ['pick-2'] }, context(), passed);

    expect(reply).toEqual({
      ok: true,
      tries: [
        {
          try: 'pick-2',
          label: 'Grasp the Red Block',
          robot: 'SO-101',
          verdict: 'passed',
          seconds: 12,
          frames: 600,
          rate: 50,
          instruction: null,
          tags: ['demo'],
          segments: [
            { index: 0, from_s: 0, to_s: 3, label: 'reach', instruction: null },
            { index: 1, from_s: 3, to_s: 6, label: 'grasp red block', instruction: null },
            { index: 2, from_s: 6, to_s: 12, label: 'lift red block', instruction: null },
          ],
          flags: [{ kind: 'joint-limit', at: 4.2, joint: 'elbow' }],
        },
      ],
      problems: [],
      images: [{ view: 'pick-2’s filmstrip', dataUrl: `data:image/webp;base64,${btoa('strip')}` }],
    });
    expect(passed).not.toHaveBeenCalled();
  });

  it('splits a try without labels before answering, and keeps the split', async () => {
    store.tries.set('pick-1', storedTry({ id: 'pick-1' }));
    store.recordings.add('pick-1');

    const reply = (await labelTries({ tries: ['pick-1'] }, context(), passed)) as { tries: { segments: unknown[] }[] };

    expect(reply.tries[0].segments).toHaveLength(3);
    expect((store.tries.get('pick-1') as StoredTry).labels?.segments).toEqual(SEGMENTS);

    await labelTries({ tries: ['pick-1'] }, context(), passed);

    expect(passed).toHaveBeenCalledTimes(1);
  });

  it('writes an instruction per try and per segment plus tags, and the next read returns them', async () => {
    const write = await labelTries(
      {
        labels: [
          {
            try: 'pick-2',
            instruction: '  pick up the red block and put it on the plate ',
            segments: ['reach for the red block', '', 'lift the red block'],
            tags: ['red block', 'demo'],
          },
        ],
      },
      context(),
      passed,
    );

    expect(write).toEqual({ ok: true, written: 1, problems: [] });

    const read = (await labelTries({ tries: ['pick-2'] }, context(), passed)) as {
      tries: { instruction: string; tags: string[]; segments: { instruction: string | null }[] }[];
    };

    expect(read.tries[0].instruction).toBe('pick up the red block and put it on the plate');
    expect(read.tries[0].tags).toEqual(['demo', 'red block']);
    expect(read.tries[0].segments.map((s) => s.instruction)).toEqual([
      'reach for the red block',
      null,
      'lift the red block',
    ]);
    expect((store.tries.get('pick-2') as StoredTry).labels?.by).toBe('agent');
  });

  it('keeps the source when only the instruction and tags change', async () => {
    await labelTries({ labels: [{ try: 'pick-2', instruction: 'wave', tags: ['hello'] }] }, context(), passed);

    expect((store.tries.get('pick-2') as StoredTry).labels).toMatchObject({ by: 'rule', instruction: 'wave' });
  });

  it('refuses a segments list of the wrong length, naming the count', async () => {
    const reply = await labelTries(
      { labels: [{ try: 'pick-2', instruction: 'grasp', segments: ['reach', 'grasp'] }] },
      context(),
      passed,
    );

    expect(reply).toEqual({
      ok: true,
      written: 0,
      problems: [expect.stringMatching(/^pick-2 has 3 segments, not 2\./)],
    });
    expect((store.tries.get('pick-2') as StoredTry).labels?.instruction).toBeUndefined();
  });

  it('reports an unknown id and still answers the rest', async () => {
    const reply = (await labelTries({ tries: ['nope', 'pick-2'] }, context(), passed)) as {
      tries: { try: string }[];
      problems: string[];
    };

    expect(reply.problems).toEqual(['No try nope.']);
    expect(reply.tries.map((t) => t.try)).toEqual(['pick-2']);
    expect(await labelTries({ labels: [{ try: 'nope', tags: ['x'] }] }, context(), passed)).toEqual({
      ok: true,
      written: 0,
      problems: ['No try nope.'],
    });
  });

  it('asks for tries or labels when given neither', async () => {
    expect(await labelTries({}, context(), passed)).toEqual({ ok: false, problem: expect.any(String) });
  });
});
