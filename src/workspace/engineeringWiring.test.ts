import { expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { resolvePrinter } from '../data/printers';
import { platformBridge } from '../utils/platformBridge';
import { reportFromShapes } from '../utils/printReport';
import { so101 } from '../wiring/fixtures';
import { wiringNetlist } from '../wiring/netlist';
import { runEngineeringNow } from './engineeringNow';

it('awaits worker cable routing even when engineering sweeps are disabled', async () => {
  const scene = so101();
  const measured = wiringNetlist(scene);
  const wiring = vi.fn(async () => measured);
  const sweepClashes = vi.fn(async () => []);
  const viewport = {
    meshesReady: async () => [],
    servoOutput: () => null,
    fastenerChains: async () => ({ screws: [], sleeves: [] }),
    measureParts: async () => ({}),
    meshGaps: async () => [],
    strength: async () => [],
    sweepClashes,
    wiring,
  } as unknown as Viewport3DHandle;
  const purchases = vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue({});
  const print = reportFromShapes([], { project: scene.project, printer: resolvePrinter('default', []) });

  try {
    const report = await runEngineeringNow({ ...scene, viewport, print, withSweep: false });

    expect(wiring).toHaveBeenCalledOnce();
    expect(wiring).toHaveBeenCalledWith({ parts: scene.parts, project: expect.objectContaining(scene.project) });
    expect(report.wiring).toBe(measured);
    expect(sweepClashes).toHaveBeenCalledWith([]);
  } finally {
    purchases.mockRestore();
  }
});
