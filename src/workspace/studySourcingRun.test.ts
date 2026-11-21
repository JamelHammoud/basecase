import { afterEach, expect, it, vi } from 'vitest';
import { sourcingEvidence, sourcingMorphologies, SOURCING_REQUIREMENTS } from '../study/sourcingFixtures';
import type { StudyRecord } from '../study/types';
import type { Simulation } from '../sim/useSimulation';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { platformBridge } from '../utils/platformBridge';
import { executeStudy } from './studyRun';
import { engineeringInputs } from './engineeringNow';
import type { SceneCaseSource } from './useCaseCompare';

vi.mock('./engineeringNow', () => ({ engineeringInputs: vi.fn() }));
vi.mock('../print/printBridge', () => ({ printBridge: { printers: async () => [] } }));
vi.mock('./studyHold', () => ({ runStudyHold: async () => 'no legs' }));

afterEach(() => vi.restoreAllMocks());

it('captures purchases once and cancels after a completed row without publishing later results', async () => {
  const scene = sourcingMorphologies().find((item) => item.name === 'fixed arm')!.scene;
  const purchases = await sourcingEvidence(scene, new Date().toISOString());
  const read = vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue(purchases);
  const source: SceneCaseSource = {
    workspaceId: 'sourcing-run',
    sceneName: 'Arm',
    docs: { partsRef: { current: scene.parts }, projectRef: { current: scene.project } },
    viewportRef: {
      current: {
        posedFloor: async () => 0,
        partTriangles: (id: string) => scene.triangles[id],
      } as unknown as Viewport3DHandle,
    },
  };
  const captured: StudyRecord[] = [];
  const controller = new AbortController();
  let stopped = false;

  vi.mocked(engineeringInputs).mockResolvedValue({ ...scene, servoOutputs: {} });

  const result = await executeStudy({
    source,
    sim: {} as Simulation,
    signal: controller.signal,
    request: {
      knobs: [{ id: 'supply', kind: 'voltage', values: [6, 7.4, 12] }],
      kase: null,
      seed: 1,
      limit: 3,
      sourcing: SOURCING_REQUIREMENTS,
    },
    stopped: () => stopped,
    onRecord: (record) => {
      captured.push(record);

      if (record.rows.length === 0) purchases['component:feetech-sts3215|c001'].supplierOffers = { offers: [] };

      if (record.rows.length === 1) {
        stopped = true;
        controller.abort();
      }
    },
  });

  expect(read).toHaveBeenCalledTimes(1);
  expect(typeof result).toBe('object');
  expect(captured.map((record) => record.rows.length)).toEqual([0, 1]);
  expect(captured[1].rows[0].purchasing?.purchasingComplete).toBe(true);
  expect(captured[1].sourcing?.purchases['component:feetech-sts3215|c001'].supplierOffers?.selectedId).toBeDefined();
  expect(captured[1].sourcing?.evaluatedAt).toBe(captured[1].rows[0].purchasing?.generatedAt);
  expect(source.docs.partsRef.current).toBe(scene.parts);
  expect(source.docs.projectRef.current).toBe(scene.project);
});
