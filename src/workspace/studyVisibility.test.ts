import { beforeEach, describe, expect, it, vi } from 'vitest';
import { visibilityDesign } from '../study/visibilityFixtures';
import { loadStudyVisibility } from './studyVisibility';

const state = vi.hoisted(() => ({
  manifests: vi.fn(),
  bytes: vi.fn(),
  build: vi.fn(),
  load: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../cases/tryStore', () => ({ loadManifests: state.manifests, loadRecordingBytes: state.bytes }));
vi.mock('../study/visibilityMeshes', () => ({ visibilityMeshFiles: async () => ({}) }));
vi.mock('../vision/trySceneClient', () => ({ buildTryScene: state.build }));
vi.mock('../study/visibilityClient', () => ({
  createVisibilitySession: () => ({ load: state.load, dispose: state.dispose }),
}));

const design = visibilityDesign(0);
const input = {
  request: { tryId: 'saved', cameras: ['eye'], targets: [{ id: 'target', minPixels: 100 }], samples: 2 },
  base: { parts: design.parts, project: design.project, measures: {}, triangles: {} },
  sceneId: 'camera-study',
  caseId: design.kase.id,
  candidates: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.manifests.mockResolvedValue([{ id: 'saved', sceneId: 'camera-study', case: { id: design.kase.id } }]);
  state.bytes.mockResolvedValue(new Uint8Array([1]));
  state.build.mockResolvedValue({ parts: [], world: [], views: [], model: null });
  state.load.mockResolvedValue('key');
});

describe('camera Study source assets', () => {
  it('refuses missing recordings and sources from another scene or Case', async () => {
    state.bytes.mockResolvedValue(null);
    await expect(loadStudyVisibility(input)).rejects.toThrow('Restore');
    expect(state.build).not.toHaveBeenCalled();
    await expect(loadStudyVisibility({ ...input, sceneId: 'another' })).rejects.toThrow('this scene');
    await expect(loadStudyVisibility({ ...input, caseId: 'another' })).rejects.toThrow('selected Case');
  });

  it('preserves missing-world errors and disposes failed source loading', async () => {
    state.build.mockRejectedValueOnce(new Error('The source world asset is missing'));
    await expect(loadStudyVisibility(input)).rejects.toThrow('world asset');
    state.load.mockRejectedValueOnce(new Error('The source model changed'));
    await expect(loadStudyVisibility(input)).rejects.toThrow('model changed');
    expect(state.dispose).toHaveBeenCalledOnce();
  });
});

it('disposes a cancelled source load and refuses its late completion', async () => {
  const controller = new AbortController();
  let finish: (key: string) => void = () => {};

  state.load.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );

  const pending = loadStudyVisibility({ ...input, signal: controller.signal });

  await vi.waitFor(() => expect(state.load).toHaveBeenCalledOnce());
  controller.abort();
  finish('late-key');
  await expect(pending).rejects.toThrow();
  expect(state.dispose).toHaveBeenCalledOnce();
});
