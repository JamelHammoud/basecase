import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wiringNetlist } from '../wiring/netlist';
import { kitFixture } from '../kit/kit.fixtures';
import { guideFingerprint } from '../guide/guideFingerprint';
import { resolvePrinter } from '../data/printers';
import { exportKit, prepareKit } from './kitExport';
import type { WorkspaceCore } from './useWorkspaceCore';

const calls = vi.hoisted(() => ({
  worker: vi.fn(),
  purchases: vi.fn(),
  inventory: vi.fn(),
  catalog: vi.fn(),
  guide: vi.fn(),
  print: vi.fn(),
  map: vi.fn(),
}));

vi.mock('../components/build/usePurchases', () => ({ knownPurchases: calls.purchases }));
vi.mock('../utils/platformBridge', () => ({ platformBridge: { listPurchases: calls.inventory } }));

vi.mock('../kit/kitClient', () => ({ kitClient: calls.worker }));

vi.mock('../three/componentMeshes', () => ({ componentMeshesReady: calls.catalog }));
vi.mock('../guide/generateGuide', () => ({ generateGuide: calls.guide }));
vi.mock('../utils/printReport', async (load) => ({ ...(await load<object>()), printReportOf: calls.print }));
vi.mock('./robotPackageExport', () => ({ robotJointMapJob: calls.map }));

function context() {
  const job = kitFixture();
  const abort = new AbortController();
  const core = {
    parts: job.parts,
    project: job.project,
    printer: job.print.printer,
    docs: { partsRef: { current: job.parts }, projectRef: { current: job.project } },
    scene: { sceneName: job.name, sceneId: 'kit' },
    readiness: { latest: () => null, fingerprint: '' },
    viewportRef: {
      current: {
        meshesReady: async () => undefined,
        measureParts: async () => job.measures,
        printShapes: vi.fn(),
        wiring: async () => wiringNetlist(job),
        assembly: async () => ({ moves: {}, chains: { screws: [], sleeves: [] }, timedOut: false }),
        printThreeMf: async () => ({ files: job.files, unlabeled: [] }),
      },
    },
  } as unknown as WorkspaceCore;
  const run = { signal: abort.signal, current: () => core };

  calls.purchases.mockReturnValue({});
  calls.inventory.mockResolvedValue({});
  calls.catalog.mockResolvedValue([]);
  calls.guide.mockResolvedValue({
    plan: job.guide.plan,
    html: job.guide.html,
    record: { fingerprint: guideFingerprint(job.name, job.parts, job.project) },
  });
  calls.print.mockResolvedValue(job.print);
  calls.map.mockResolvedValue(job.mapInput);

  return { core, run, abort, job };
}

beforeEach(() => vi.clearAllMocks());

describe('kit preparation snapshot', () => {
  it('resolves a fresh guide and writes all plates from the frozen scene', async () => {
    const { core, run, job } = context();
    const made = await prepareKit(core, run);

    expect(made.parts).toEqual(job.parts);
    expect(made.project).toEqual(job.project);
    expect(made.files).toEqual(job.files);
    expect(calls.guide).toHaveBeenCalledWith(
      expect.objectContaining({ parts: job.parts, project: job.project, persist: false }),
    );
  });

  it('loads saved owned counts before freezing a cold inventory', async () => {
    const { core, run } = context();
    const owned = { 'hardware:socket_head|M3|8|': { onHand: 1 } };

    calls.purchases.mockReturnValue(null);
    calls.inventory.mockResolvedValue(owned);

    const made = await prepareKit(core, run);

    expect(made.purchases).toEqual(owned);
    expect(made.checksFingerprint).toBe('');
  });

  it('refuses failed assembly analysis without generating an unproven substitute', async () => {
    const { core, run } = context();

    core.viewportRef.current!.assembly = async () => {
      throw new Error('Assembly failed');
    };
    await expect(prepareKit(core, run)).rejects.toThrow('Checking the build order: Assembly failed');
    expect(
      (performance.getEntriesByName('kit:Checking the build order').at(-1) as PerformanceMeasure | undefined)?.detail,
    ).toEqual({
      error: 'Assembly failed',
    });
    expect(calls.guide).not.toHaveBeenCalled();
  });

  it('rejects oversized source geometry before requesting any preparation', async () => {
    const { core, run } = context();

    core.parts[0] = { ...core.parts[0], mesh: { positions: { length: 40_000_000 }, indices: [] } } as never;
    await expect(prepareKit(core, run)).rejects.toThrow('256 MB');
    expect(calls.catalog).not.toHaveBeenCalled();
  });

  it('rejects excessive scene cardinality before geometry preparation', async () => {
    const { core, run } = context();

    core.parts = Array.from({ length: 10001 }, () => core.parts[0]);
    core.docs.partsRef.current = core.parts;
    await expect(prepareKit(core, run)).rejects.toThrow('10,000 scene parts');
    expect(calls.catalog).not.toHaveBeenCalled();
  });

  it('refuses missing catalog geometry before guide preparation', async () => {
    const { core, run } = context();

    calls.catalog.mockResolvedValue(['feetech-sts3215']);
    await expect(prepareKit(core, run)).rejects.toThrow('catalog geometry');
    expect(calls.guide).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'edit'] as const)('discards a completed archive after %s during compression', async (fault) => {
    const { core, run, abort } = context();
    const dispose = vi.fn();

    calls.worker.mockReturnValue({
      dispose,
      call: async () => {
        if (fault === 'cancel') abort.abort();

        if (fault === 'edit') core.docs.partsRef.current = [...core.parts];

        return new Uint8Array([1]);
      },
    });
    await expect(exportKit(core, run)).rejects.toThrow();
    expect(dispose).toHaveBeenCalled();
  });

  it.each(['before', 'during'] as const)('discards cancellation %s preparation', async (when) => {
    const { core, run, abort } = context();

    if (when === 'before') abort.abort();

    if (when === 'during')
      calls.guide.mockImplementation(async () => {
        abort.abort();

        return null;
      });

    await expect(prepareKit(core, run)).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.map).not.toHaveBeenCalled();

    if (when === 'during') {
      const measure = performance.getEntriesByName('kit:Build guide').at(-1) as PerformanceMeasure;

      expect(measure.detail).toEqual({ error: abort.signal.reason.message });
    }
  });

  it.each(['parts', 'project', 'name', 'scene'] as const)('discards an edit to %s during export', async (field) => {
    const { core, run } = context();

    calls.print.mockImplementation(async () => {
      if (field === 'parts') core.docs.partsRef.current = [...core.parts];

      if (field === 'project') core.docs.projectRef.current = { ...core.project, material: 'PETG' };

      if (field === 'scene') core.scene = { ...core.scene, sceneId: 'other' };

      if (field === 'name') core.scene = { ...core.scene, sceneName: 'Edited' };

      return kitFixture().print;
    });
    await expect(prepareKit(core, run)).rejects.toThrow('scene changed');
    expect(calls.map).not.toHaveBeenCalled();
  });

  it.each(['width', 'depth', 'height'] as const)(
    'discards a custom printer %s edit during export',
    async (dimension) => {
      const { core, run, job } = context();
      const saved = {
        id: 'kit-printer',
        modelId: 'custom',
        nickname: 'Kit printer',
        nozzle: 0.4,
        custom: { width: 256, depth: 256, height: 256 },
      };

      core.printer = resolvePrinter(saved.id, [saved]);
      calls.print.mockImplementation(async () => {
        core.printer = resolvePrinter(saved.id, [{ ...saved, custom: { ...saved.custom, [dimension]: 100 } }]);

        return job.print;
      });
      await expect(prepareKit(core, run)).rejects.toThrow('scene changed');
      expect(calls.map).not.toHaveBeenCalled();
    },
  );
});
