import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filmImage } from '../cases/filmImage';
import type { StoredTry } from '../cases/tryFile';
import type { TryLabels, TrySegment } from '../cases/tryLabels';
import { loadRecording, loadStoredTry, loadStrip, relabelTries } from '../cases/tryStore';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { TRY_HANDLERS } from './agentTryRequests';
import { ruleSegments, type SegmentingScene } from './trySegmenting';

vi.mock('../cases/tryStore', () => ({
  loadStoredTry: vi.fn(),
  loadRecording: vi.fn(),
  loadStrip: vi.fn(),
  relabelTries: vi.fn(async () => {}),
}));

vi.mock('./trySegmenting', () => ({ ruleSegments: vi.fn() }));

vi.mock('../cases/filmImage', () => ({ filmImage: vi.fn(async () => 'data:image/png;base64,RklMTQ==') }));

vi.mock('../utils/imageEncode', () => ({ encodeBitmap: vi.fn(async () => 'data:image/png;base64,U1RSSVA=') }));

const SCENE = 'scene-1';
const BODIES = 4;

const segment = (start: number, end: number, label: string, more: Partial<TrySegment> = {}): TrySegment => ({
  start,
  end,
  label,
  ...more,
});

function storedTry(id: string, more: { sceneId?: string; labels?: TryLabels } = {}): StoredTry {
  return {
    version: 1,
    id,
    sceneId: more.sceneId ?? SCENE,
    robot: { name: 'Arm', modelHash: 'm1', joints: ['shoulder'] },
    case: { id: 'case-1', name: 'Touch the Dots', hash: 'c1' },
    source: 'case',
    input: null,
    startedAt: '2026-11-14T08:00:00.000Z',
    seconds: 4,
    rate: 50,
    frames: 200,
    outcome: { verdict: 'passed', margin: 0.2 },
    seed: 1,
    sourceTry: null,
    faults: [],
    ...(more.labels ? { labels: more.labels } : {}),
  };
}

const scene = {
  model: { bodies: Array.from({ length: BODIES }, () => ({})) } as unknown as SimModel,
  rig: { robots: [], joints: [] },
  parts: [],
  joints: [],
  cases: [],
  partners: [],
} as unknown as SegmentingScene;

const recording = { nbody: BODIES, frames: 200 } as unknown as Recording;
const ctx = { cases: { sceneId: SCENE }, segmentingScene: vi.fn(async () => scene) };

function store(...tries: StoredTry[]) {
  vi.mocked(loadStoredTry).mockImplementation(async (id) => tries.find((t) => t.id === id) ?? null);
}

const label = (payload: Record<string, unknown>) =>
  TRY_HANDLERS.label_tries(payload, ctx) as Promise<{
    text: string;
    images: Array<{ view: string; dataUrl: string }>;
    data: Record<string, unknown[]>;
  }>;

function reset() {
  vi.clearAllMocks();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({})),
  );
  vi.mocked(loadStrip).mockResolvedValue(null);
  vi.mocked(loadRecording).mockResolvedValue(recording);
  vi.mocked(ruleSegments).mockResolvedValue([segment(0, 60, 'reach'), segment(60, 200, 'touch')]);
}

describe('label_tries reads', () => {
  beforeEach(reset);

  it('reads a labelled try with its stored segments in seconds and its kept filmstrip as a PNG', async () => {
    const labels = {
      instruction: 'touch the red dot',
      tags: ['clean'],
      segments: [segment(0, 75, 'reach', { instruction: 'move over the dot' }), segment(75, 200, 'touch')],
    };

    store(storedTry('try-a', { labels }));
    vi.mocked(loadStrip).mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));

    const reply = await label({ ids: ['try-a', 'try-gone'] });

    expect(reply.data.tries).toEqual([
      {
        id: 'try-a',
        robot: 'Arm',
        case: 'Touch the Dots',
        source: 'case',
        outcome: 'passed',
        seconds: 4,
        tags: ['clean'],
        instruction: 'touch the red dot',
        segments: [
          { index: 0, start: 0, end: 1.5, label: 'reach', instruction: 'move over the dot' },
          { index: 1, start: 1.5, end: 4, label: 'touch' },
        ],
        segments_from: 'stored',
        film: true,
      },
    ]);
    expect(reply.data.problems).toEqual(['No try try-gone.']);
    expect(reply.images).toEqual([
      { view: 'Try try-a: its filmstrip, start to end.', dataUrl: 'data:image/png;base64,U1RSSVA=' },
    ]);
    expect(JSON.parse(reply.text)).toEqual(reply.data);
    expect(ruleSegments).not.toHaveBeenCalled();
  });

  it('splits a try from this scene by rule and draws its film when nothing is kept', async () => {
    store(storedTry('try-b'));

    const reply = await label({ ids: ['try-b'] });

    expect(reply.data.tries).toMatchObject([
      {
        segments: [
          { index: 0, start: 0, end: 1.2, label: 'reach' },
          { index: 1, start: 1.2, end: 4, label: 'touch' },
        ],
        segments_from: 'rule',
        film: true,
      },
    ]);
    expect(reply.images[0].dataUrl).toBe('data:image/png;base64,RklMTQ==');
    expect(filmImage).toHaveBeenCalledOnce();
    expect(loadRecording).toHaveBeenCalledOnce();
  });

  it('gives a try from another scene no segments and no image', async () => {
    store(storedTry('try-c', { sceneId: 'scene-2' }));

    const reply = await label({ ids: ['try-c'] });

    expect(reply.data.tries).toMatchObject([{ segments: [], segments_from: null, film: false }]);
    expect(reply.images).toEqual([]);
    expect(loadRecording).not.toHaveBeenCalled();
  });
});

describe('label_tries writes', () => {
  beforeEach(reset);

  it('writes a try’s instruction, a segment’s instruction and added tags in one call', async () => {
    const labels = {
      tags: ['clean'],
      segments: [segment(0, 75, 'reach', { tags: ['slow'] }), segment(75, 200, 'touch')],
    };

    store(storedTry('try-a', { labels }));

    const reply = await label({
      labels: [
        {
          id: 'try-a',
          instruction: 'touch the red dot',
          tags: ['clean', 'red'],
          segments: [{ index: 0, instruction: 'move over the dot', tags: ['careful'] }],
        },
      ],
    });

    expect(relabelTries).toHaveBeenCalledOnce();
    expect(relabelTries).toHaveBeenCalledWith([
      {
        id: 'try-a',
        patch: {
          instruction: 'touch the red dot',
          tags: ['clean', 'red'],
          segments: [
            segment(0, 75, 'reach', { instruction: 'move over the dot', tags: ['slow', 'careful'] }),
            segment(75, 200, 'touch'),
          ],
        },
      },
    ]);
    expect(reply.data.written).toEqual([
      {
        id: 'try-a',
        instruction: 'touch the red dot',
        tags: ['clean', 'red'],
        segments: [{ index: 0, label: 'reach', instruction: 'move over the dot', tags: ['slow', 'careful'] }],
      },
    ]);
    expect(reply.data.tries).toBeUndefined();
  });

  it('stores rule segments when the agent labels one, and refuses a segment that isn’t there', async () => {
    store(storedTry('try-b'), storedTry('try-c', { sceneId: 'scene-2' }));

    const reply = await label({
      labels: [
        { id: 'try-b', segments: [{ index: 1, label: 'press', instruction: 'press the dot' }] },
        { id: 'try-b', instruction: 'again' },
        { id: 'try-c', segments: [{ index: 0, label: 'reach' }] },
        { id: 'try-gone', instruction: 'touch the dot' },
      ],
    });

    expect(relabelTries).toHaveBeenCalledWith([
      {
        id: 'try-b',
        patch: { segments: [segment(0, 60, 'reach'), segment(60, 200, 'press', { instruction: 'press the dot' })] },
      },
    ]);
    expect(reply.data.problems).toEqual([
      'Try try-b is listed twice; send its labels once.',
      expect.stringMatching(/^Try try-c has no segments/),
      'No try try-gone.',
    ]);
  });

  it('refuses a call with nothing to read or write', async () => {
    expect(await TRY_HANDLERS.label_tries({}, ctx)).toEqual({ ok: false, problem: expect.any(String) });
  });
});
