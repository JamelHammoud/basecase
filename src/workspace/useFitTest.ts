import { useState } from 'react';
import * as THREE from 'three';
import type { PrinterSetup } from '../data/printers';
import { canFitTest, couponPart, fitTestInput, fitTestReport } from '../print/fitTest';
import { threeMfIn } from '../three/analysis/analysisPool';
import type { FitCoupon } from '../three/analysis/fitCoupons';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { printReportOf } from '../utils/printReport';
import type { PlateFiles } from './usePlateWriter';

interface FitTestOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  printer: PrinterSetup;
  viewport: () => Viewport3DHandle | null;
}

interface Cut {
  coupons: FitCoupon[];
  parts: ScenePart[];
}

async function couponThreeMf(cut: Cut, plates: PlateFiles) {
  const objects = cut.coupons.map((c, i) => {
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(c.positions, 3));

    return { id: cut.parts[i].id, object: new THREE.Mesh(geometry) };
  });

  try {
    return (await threeMfIn(snapshotShapes(objects), plates)).files;
  } finally {
    objects.forEach((o) => o.object.geometry.dispose());
  }
}

export function useFitTest({ parts, project, printer, viewport }: FitTestOptions) {
  const [cut, setCut] = useState<Cut | null>(null);
  const [cutting, setCutting] = useState(false);
  const ctx = { project, printer };
  const report = cut && fitTestReport(cut.coupons, cut.parts, ctx);

  const start = async (): Promise<boolean> => {
    const view = viewport();
    const input = fitTestInput(parts);

    if (!view || cutting || !canFitTest(parts)) return false;

    setCutting(true);

    try {
      const design = await printReportOf(parts, ctx, view.printShapes);
      const downs = Object.fromEntries(design.parts.map((r) => [r.id, r.check.pose.down]));
      const coupons = await view.fitCoupons({ ...input, downs });
      const byId = new Map(parts.map((p) => [p.id, p]));

      if (!coupons.length) return false;

      setCut({ coupons, parts: coupons.map((c, i) => couponPart(c, byId.get(c.host), i)) });

      return true;
    } finally {
      setCutting(false);
    }
  };

  return {
    active: !!cut,
    parts: cut?.parts ?? null,
    report,
    cutting,
    available: canFitTest(parts),
    start,
    leave: () => setCut(null),
    threeMf: (plates: PlateFiles): Promise<Record<string, Uint8Array>> =>
      cut ? couponThreeMf(cut, plates) : Promise.resolve({}),
  };
}
