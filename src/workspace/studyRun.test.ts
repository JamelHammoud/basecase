import { describe, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { servoArm } from '../sim/fixtures/servoArm';
import { DEFAULT_PROJECT } from '../types/robotics';
import { noRuns } from '../cases/caseRuns';
import { touchTheDots } from '../cases/testing';
import { fixtureMeasures } from '../sim/fixtures/parts';
import type { Simulation } from '../sim/useSimulation';
import { platformBridge } from '../utils/platformBridge';
import { exploreVerdict } from './caseChecks';
import { engineeringInputs } from './engineeringNow';
import { executeStudy, snapshotStudy } from './studyRun';
import type { SceneCaseSource } from './useCaseCompare';

vi.mock('./engineeringNow', () => ({ engineeringInputs: vi.fn() }));
vi.mock('../print/printBridge', () => ({ printBridge: { printers: async () => [] } }));
vi.mock('./caseChecks', () => ({ exploreVerdict: vi.fn() }));
vi.mock('./studyHold', () => ({ runStudyHold: async () => 'no legs' }));

function sourceFixture() {
  const robot = servoArm();
  const source: SceneCaseSource = {
    workspaceId: 'study',
    sceneName: 'Study arm',
    docs: {
      partsRef: { current: robot.parts },
      projectRef: { current: { ...DEFAULT_PROJECT, joints: robot.joints } },
    },
    viewportRef: {
      current: {
        posedFloor: async () => 0,
        partTriangles: () => new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      } as unknown as Viewport3DHandle,
    },
  };

  return source;
}

describe('Study snapshot', () => {
  it('rates baseline and candidate Case runs at their actual supply voltage', async () => {
    const source = sourceFixture();
    const parts = source.docs.partsRef.current;
    const kase = touchTheDots(servoArm());
    const purchases = vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue({});

    source.docs.projectRef.current = { ...source.docs.projectRef.current, tether: { volts: 7.4, amps: 5 } };
    vi.mocked(engineeringInputs).mockResolvedValue({
      parts,
      project: source.docs.projectRef.current,
      measures: fixtureMeasures(parts),
      servoOutputs: {},
    });
    vi.mocked(exploreVerdict).mockResolvedValue({ ...noRuns(''), refusal: null, runs: 8, passes: 8 });

    try {
      const record = await executeStudy({
        source,
        sim: {} as Simulation,
        request: { knobs: [{ id: 'voltage', kind: 'voltage', values: [6, 12] }], kase, seed: 1, limit: 2 },
        stopped: () => false,
        onRecord: () => {},
      });

      expect(typeof record).toBe('object');
      expect(vi.mocked(exploreVerdict).mock.calls.map(([input]) => input.servoVolts)).toEqual([7.4, 6, 12]);
      expect(vi.mocked(exploreVerdict).mock.calls.every(([, tested, runs]) => tested === kase && runs === 8)).toBe(
        true,
      );
    } finally {
      purchases.mockRestore();
    }
  });

  it('rejects scene edits made while its geometry is being measured', async () => {
    const source = sourceFixture();
    let finish: () => void = () => {};

    vi.mocked(engineeringInputs).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });

      return { parts: [], project: DEFAULT_PROJECT, measures: {}, servoOutputs: {} };
    });

    const snapshot = snapshotStudy(source);

    source.docs.partsRef.current = source.docs.partsRef.current.map((p) => ({ ...p, massG: 100 }));
    finish();

    await expect(snapshot).rejects.toThrow('The scene changed.');
  });

  it('keeps the captured parts, voltage, measured floor and geometry together', async () => {
    const source = sourceFixture();

    source.docs.projectRef.current = { ...source.docs.projectRef.current, tether: { volts: 7.4, amps: 5 } };
    vi.mocked(engineeringInputs).mockResolvedValue({
      parts: [],
      project: DEFAULT_PROJECT,
      measures: {},
      servoOutputs: {},
    });

    const snapshot = await snapshotStudy(source);

    expect(snapshot.parts).toBe(source.docs.partsRef.current);
    expect(snapshot.project.tether?.volts).toBeCloseTo(7.4);
    expect(snapshot.posedFloor).toBe(0);
    expect(Object.keys(snapshot.triangles)).toHaveLength(snapshot.parts.length);
  });
});
