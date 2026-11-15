import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../cases/tryFile';
import { frameSourceCameras, loadFrameLabelSources } from './frameLabelSources';

const mocks = vi.hoisted(() => ({ manifests: vi.fn(), recording: vi.fn(async () => null) }));

vi.mock('../cases/tryStore', () => ({ loadManifests: mocks.manifests, loadRecording: mocks.recording }));

const stored = (id: string, cameras: string[]): StoredTry => ({
  version: 1,
  id,
  sceneId: 'scene',
  robot: { name: 'Robot', modelHash: 'hash', joints: [] },
  case: null,
  source: 'operate',
  input: null,
  startedAt: '2026-11-15',
  seconds: 1,
  rate: 50,
  frames: 50,
  outcome: { verdict: 'unjudged', margin: null },
  seed: 0,
  sourceTry: null,
  faults: [],
  videos: cameras.map((camera) => ({ camera, path: `${camera}.mp4`, from: 0, to: 1 })),
});

beforeEach(() => vi.clearAllMocks());

describe('frame label source loading', () => {
  it('opens real Operate video tries without requesting a simulation scene or timeline', async () => {
    const sceneFor = vi.fn(async () => ({ parts: [], world: [], model: null, views: [] }));

    mocks.manifests.mockResolvedValue([stored('first', ['front', 'wrist']), stored('second', ['front'])]);

    const sources = await loadFrameLabelSources(['first', 'second'], sceneFor);

    expect(sceneFor).not.toHaveBeenCalled();
    expect(sources.map((source) => source.stored.id)).toEqual(['first', 'second']);
    expect(await frameSourceCameras(sources)).toEqual(['front']);
  });

  it('requires simulation context when recorded cameras are absent and refuses a missing source', async () => {
    const scene = { parts: [], world: [], model: null, views: [] };
    const sceneFor = vi.fn(async () => scene);

    mocks.manifests.mockResolvedValue([{ ...stored('simulation', []), source: 'case' }]);

    const sources = await loadFrameLabelSources(['simulation'], sceneFor);

    expect(sceneFor).toHaveBeenCalledWith(sources[0].stored);
    expect(sources[0].scene).toBe(scene);
    await expect(loadFrameLabelSources(['simulation', 'missing'], sceneFor)).rejects.toThrow('could not be opened');
  });

  it('refuses a real try without recorded images instead of rendering simulated pixels', async () => {
    const sceneFor = vi.fn(async () => ({ parts: [], world: [], model: null, views: [] }));

    mocks.manifests.mockResolvedValue([stored('real', [])]);

    await expect(loadFrameLabelSources(['real'], sceneFor)).rejects.toThrow('no recorded camera frames');
    expect(sceneFor).not.toHaveBeenCalled();
  });
});
