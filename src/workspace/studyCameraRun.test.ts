import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Simulation } from '../sim/useSimulation';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { visibilityDesign } from '../study/visibilityFixtures';
import { summarizeVisibility } from '../study/visibility';
import { gradeStudy } from '../study/study';
import type { StudyKnob, StudyScene, StudyGradeOptions } from '../study/types';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { platformBridge } from '../utils/platformBridge';
import { executeStudy } from './studyRun';
import type { SceneCaseSource } from './useCaseCompare';

const state = vi.hoisted(() => ({
  load: vi.fn(),
  refresh: vi.fn(),
  dispose: vi.fn(),
  captureDispose: vi.fn(),
  measure: vi.fn(),
  caseRuns: vi.fn(),
}));

vi.mock('../study/visibilityMeshes', () => ({ visibilityMeshFiles: async () => ({}) }));
vi.mock('./studyVisibility', () => ({ loadStudyVisibility: state.load }));
vi.mock('./caseChecks', () => ({ exploreVerdict: state.caseRuns }));
vi.mock('../print/printBridge', () => ({ printBridge: { printers: async () => [] } }));
vi.mock('./engineeringNow', () => ({ engineeringInputs: async () => ({ measures: {}, servoOutputs: {} }) }));
vi.mock('../study/client', () => ({
  createStudySession: () => ({
    grade: async (scene: StudyScene, options: StudyGradeOptions) => gradeStudy(scene, options),
    refresh: state.refresh,
    dispose: state.dispose,
  }),
}));

const knobs: StudyKnob[] = [
  {
    id: 'pose',
    kind: 'camera_pose',
    part: 'eye',
    values: [
      { position: [-2.47, 200, 5.12], rotation: [90, 0, 0] },
      { position: [-2.47, 200, 5.12], rotation: [-90, 0, 0] },
    ],
  },
];
const visibility = { tryId: 'saved', cameras: ['eye'], targets: [{ id: 'target', minPixels: 100 }], samples: 2 };
const result = summarizeVisibility({
  key: 'immutable-source',
  width: 320,
  height: 240,
  times: [0, 1],
  end: 2,
  cameras: ['eye'],
  targets: visibility.targets,
  captures: [[{ target: { pixels: 200, potential: 200 } }, null]],
});

function options() {
  const design = visibilityDesign(0);
  const source: SceneCaseSource = {
    sceneId: 'camera-study',
    workspaceId: 'tab',
    sceneName: 'Rover',
    docs: { partsRef: { current: design.parts }, projectRef: { current: design.project } },
    viewportRef: {
      current: {
        partTriangles: fixtureTriangles(design.parts),
        posedFloor: async () => 0,
      } as unknown as Viewport3DHandle,
    },
  };

  return {
    source,
    sim: {} as Simulation,
    request: { knobs, visibility, kase: design.kase, limit: 2, seed: 1 },
    stopped: () => false,
    onRecord: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue({});
  state.refresh.mockImplementation(async (scene: StudyScene) => ({
    ...scene,
    triangles: Object.fromEntries(scene.parts.map((part) => [part.id, fixtureTriangles(scene.parts)(part.id)!])),
  }));
  state.measure.mockResolvedValue(result);
  state.load.mockResolvedValue({ key: result.key, measure: state.measure, dispose: state.captureDispose });
});

describe('recorded camera Study execution', () => {
  it('loads one immutable source, reuses geometry across candidates and never copies Case passes', async () => {
    const input = options();
    const record = await executeStudy(input);

    expect(typeof record).toBe('object');
    expect(state.load).toHaveBeenCalledOnce();
    expect(state.measure).toHaveBeenCalledTimes(3);
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(state.caseRuns).not.toHaveBeenCalled();
    expect(state.captureDispose).toHaveBeenCalledOnce();
    expect(state.dispose).toHaveBeenCalledOnce();

    if (typeof record === 'string') throw new Error(record);

    expect([record.current, ...record.rows].every((row) => !row.runs && row.visibility?.key === result.key)).toBe(true);

    const captures = state.measure.mock.calls.map(([scene]) => scene);

    expect(captures.every((scene) => scene.triangles.eye === captures[0].triangles.eye)).toBe(true);
    expect(record.visibility).toEqual(visibility);
  });

  it.each(['stop', 'scene switch'])('disposes a capture after %s and publishes no delayed row', async (action) => {
    const input = options();
    const originalScene = input.source.sceneId;
    let stopped = false;

    state.measure.mockImplementationOnce(async () => {
      if (action === 'stop') stopped = true;
      else input.source.sceneId = 'another-scene';

      return result;
    });
    await executeStudy({ ...input, stopped: () => stopped || input.source.sceneId !== originalScene });
    expect(input.onRecord).not.toHaveBeenCalled();
    expect(state.measure).toHaveBeenCalledOnce();
    expect(state.captureDispose).toHaveBeenCalledOnce();
  });

  it('rejects mechanism edits and wrong or absent source selections before capture', async () => {
    const input = options();

    expect(
      await executeStudy({
        ...input,
        request: { ...input.request, knobs: [{ id: 'power', kind: 'voltage', values: [6] }] },
      }),
    ).toContain('separately');
    expect(
      await executeStudy({ ...input, request: { ...input.request, visibility: { ...visibility, targets: [] } } }),
    ).toContain('Choose');
    expect(state.load).not.toHaveBeenCalled();
  });
});
