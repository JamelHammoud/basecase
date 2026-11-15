import { describe, expect, it, vi } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { so101 } from '../wiring/fixtures';
import { analyzeWiring } from '../wiring/routeAnalysis';
import { buildBom } from '../utils/bom';
import { budgetPlanText } from '../utils/budget';
import { platformBridge } from '../utils/platformBridge';
import { budgetPlanNote } from './agentCostRequests';
import { requestHandler, type RequestContext } from './agentRequestHandlers';
import { buildCommands } from './buildCommands';
import type { CommandInputs } from './sceneCommands';
import * as links from '../utils/openLink';
import * as purchaseStore from '../components/build/usePurchases';

function fixture() {
  const base = so101();
  const scene = { ...base, project: { ...base.project, budgetUsd: 100, joints: [] } };
  const measured = analyzeWiring(scene, []);
  const viewport = { measureParts: async () => ({}), wiring: vi.fn(async () => measured) };
  const context = {
    parts: () => scene.parts,
    project: () => scene.project,
    printer: () => resolvePrinter('default', []),
    viewport: () => viewport,
  } as unknown as RequestContext;

  vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue({});

  return { scene, measured, viewport, context };
}

describe('measured wiring in BOM consumers', () => {
  it('uses measured cable stock in the agent BOM reply', async () => {
    const { scene, viewport, context } = fixture();
    const result = await requestHandler('bom')!({}, context, 'bom');

    expect(viewport.wiring).toHaveBeenCalledWith(scene);
    expect(result).toMatchObject({ text: expect.stringContaining('Waveshare 5264 Servo Cable 300 mm') });
    expect(result).toMatchObject({ text: expect.not.stringContaining('[supply:servo-cable-5264-3pin]') });
  });

  it('uses measured cable stock when preparing the agent budget plan', async () => {
    const { scene, measured, viewport, context } = fixture();
    const expected = buildBom({ ...scene, purchases: {}, measures: {}, wiring: measured });

    expect(await budgetPlanNote(context)).toBe(budgetPlanText(100, expected, undefined));
    expect(viewport.wiring).toHaveBeenCalledWith(scene);
  });

  it('remeasures the cable choice before Buy All opens the cart', async () => {
    const { scene, measured, viewport } = fixture();
    const checked = { packQty: 6, priceUsd: 1.99, checkedAt: '2026-11-14', asin: 'B0ABCDEFGH' };
    const purchases = {
      'component:feetech-sts3215|c001': { ...checked, packQty: 1, asin: 'B0COMPONEN' },
      'supply:waveshare-servo-cable-5264-300': checked,
    };
    const open = vi.spyOn(links, 'openLink').mockImplementation(() => {});
    const core = {
      ...scene,
      printing: { measures: {} },
      readiness: { current: null, fingerprint: 'now' },
      viewportRef: { current: viewport },
      docs: { partsRef: { current: scene.parts }, projectRef: { current: scene.project } },
      guide: { progress: null, record: null },
    };

    vi.spyOn(purchaseStore, 'knownPurchases').mockReturnValue(purchases);

    const command = buildCommands({ core } as unknown as CommandInputs).find((item) => item.id === 'buy-all')!;

    await command.run();
    expect(viewport.wiring).toHaveBeenCalledWith(scene);
    expect(open).toHaveBeenCalledWith(expect.stringContaining('B0ABCDEFGH'));
    open.mockClear();
    viewport.wiring.mockImplementationOnce(async () => {
      core.docs.partsRef.current = [...scene.parts];

      return measured;
    });
    await command.run();
    expect(open).not.toHaveBeenCalled();
  });
});
