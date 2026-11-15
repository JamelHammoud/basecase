import { expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { resolvePrinter } from '../data/printers';
import { guideFingerprint } from '../guide/guideFingerprint';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { buildTime } from '../utils/engineeringTime';
import { platformBridge } from '../utils/platformBridge';
import { reportFromShapes } from '../utils/printReport';
import { engineeringInputs, runEngineeringNow } from './engineeringNow';
import { wiringNetlist } from '../wiring/netlist';

it('uses saved assembly steps after assigning fasteners to moving links', async () => {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const base = { ...rover.parts[0], id: 'base' };
  const link = { ...base, id: 'link', position: [50, 0, 0] as [number, number, number] };
  const insert: ScenePart = {
    ...link,
    id: 'insert',
    kind: 'hardware',
    hardware: { type: 'heat_insert', size: 'M3', length: 6 },
  };
  const parts = [base, link, insert];
  const project = {
    ...DEFAULT_PROJECT,
    joints: [{ ...rover.joints[0], parent: ['base'], child: ['link'] }],
  };
  const settings = {
    ...project,
    buildGuide: {
      id: 'guide',
      pages: 1,
      steps: 1,
      generatedAt: '2026-11-14',
      fingerprint: 'guide',
      stepParts: { fingerprint: guideFingerprint('', parts, project), ids: [['base', 'link', 'insert']] },
    },
  };
  const print = reportFromShapes([], { project: settings, printer: resolvePrinter('default', []) });
  const viewport = {
    meshesReady: async () => [],
    fastenerChains: async () => ({
      screws: [],
      sleeves: [{ id: 'insert', kind: 'insert', host: 'link', screw: null }],
    }),
    measureParts: async () => ({}),
    meshGaps: async () => [],
    sweepClashes: async () => [],
    strength: async () => [],
    wiring: async () => wiringNetlist({ parts, project: settings }),
  } as unknown as Viewport3DHandle;
  const purchases = vi.spyOn(platformBridge, 'listPurchases').mockResolvedValue({});

  try {
    const resolved = await engineeringInputs(viewport, parts, settings);

    expect(resolved.project.joints?.[0].child).toContain('insert');

    const report = await runEngineeringNow({ viewport, parts, project: settings, print, withSweep: false });

    expect(report.rows.find((row) => row.check === 'Time')?.hours).toBeCloseTo(
      buildTime({ parts, project: settings, print }).hours,
    );
  } finally {
    purchases.mockRestore();
  }
});
