import { describe, expect, it, vi } from 'vitest';
import { makeSpec } from '../data/hardware';
import { DEFAULT_PROJECT, type Purchases, type ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { platformBridge } from '../utils/platformBridge';
import { recordOnHandRequest } from './agentCostRequests';

describe('record_on_hand', () => {
  it('saves counts by catalog key', async () => {
    const saved: Record<string, unknown> = {};

    vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue({});
    vi.spyOn(platformBridge, 'savePurchase').mockImplementation(async (key, record) => {
      saved[key] = record;

      return { ...saved } as Awaited<ReturnType<typeof platformBridge.savePurchase>>;
    });

    const reply = await recordOnHandRequest({ counts: [{ key: 'component:feetech-sts3215|c001', count: 6 }] });

    expect(reply.text).toBe('On hand: 6× component:feetech-sts3215|c001.');
    expect(saved).toEqual({ 'component:feetech-sts3215|c001': { onHand: 6 } });
  });

  it('refuses unknown keys and counts that are negative or not whole, and saves nothing', async () => {
    const save = vi.spyOn(platformBridge, 'savePurchase');

    save.mockClear();

    for (const counts of [
      [{ key: 'component:not-a-part', count: 1 }],
      [{ key: 'component:feetech-sts3215|c001', count: -1 }],
      [{ key: 'component:feetech-sts3215|c001', count: 2.5 }],
      [{ key: '__proto__', count: 1 }],
      [null],
      [],
    ])
      expect((await recordOnHandRequest({ counts })).text).toMatch(/^Nothing recorded: /);

    expect(save).not.toHaveBeenCalled();
  });

  it('asks for the version of a part that comes in versions, so the count lands on its BOM line', async () => {
    const save = vi.spyOn(platformBridge, 'savePurchase');

    save.mockClear();

    const reply = await recordOnHandRequest({ counts: [{ key: 'component:feetech-sts3215', count: 6 }] });

    expect(reply.text).toBe(
      'Nothing recorded: component:feetech-sts3215 needs its version: component:feetech-sts3215|c001, component:feetech-sts3215|c018, component:feetech-sts3215|c044, component:feetech-sts3215|c046. Use keys from find_parts or get_bom.',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('saves a short hardware key under the key its BOM line uses', async () => {
    const saved: Purchases = {};

    vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue({});
    vi.spyOn(platformBridge, 'savePurchase').mockImplementation(async (key, record) => {
      if (record) saved[key] = record;

      return { ...saved };
    });

    const reply = await recordOnHandRequest({ counts: [{ key: 'hardware:socket_head|M3|10', count: 100 }] });
    const screw = {
      kind: 'hardware',
      role: 'solid',
      visible: true,
      hardware: makeSpec('socket_head', { size: 'M3', length: 10 }),
    };
    const parts = Array.from({ length: 13 }, (_, i) => ({ ...screw, id: `screw${i}` }) as ScenePart);
    const bom = buildBom({ parts, project: DEFAULT_PROJECT, purchases: saved, measures: {} });

    expect(reply.text).toBe('On hand: 100× hardware:socket_head|M3|10|black|hex.');
    expect(bom.lines.find((l) => l.key === 'hardware:socket_head|M3|10|black|hex')).toMatchObject({
      owned: 13,
      toBuy: 0,
    });
  });
});
