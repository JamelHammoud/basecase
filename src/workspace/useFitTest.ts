import { useEffect, useRef, useState } from 'react';
import { useLatestRef } from '../utils/useLatestRef';
import type { Vec3 } from '../three/printability';
import type { PrinterSetup } from '../data/printers';
import { canFitTest, couponPart, fitTestInput, fitTestReport } from '../print/fitTest';
import { geometryWorker } from '../three/geometryWorker';
import { useFitVariants, type FitVariantOptions } from './useFitVariants';
import type { FitCoupon } from '../three/analysis/fitCoupons';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { printReportOf } from '../utils/printReport';
import type { PlateFiles, WrittenPlates } from './usePlateWriter';

interface FitTestOptions extends FitVariantOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  printer: PrinterSetup;
  viewport: () => Viewport3DHandle | null;
}

interface Cut {
  coupons: FitCoupon[];
  parts: ScenePart[];
  downs: Record<string, Vec3>;
}

export function useFitTest(options: FitTestOptions) {
  const { parts, project, printer, viewport } = options;
  const variants = useFitVariants(options);
  const latest = useLatestRef(options);
  const generation = useRef(0);
  const [scope, setScope] = useState({ jobId: options.jobId, active: options.active });
  const [cut, setCut] = useState<Cut | null>(null);
  const [cutting, setCutting] = useState(false);

  if (scope.jobId !== options.jobId || scope.active !== options.active) {
    setScope({ jobId: options.jobId, active: options.active });
    setCut(null);
    setCutting(false);
  }

  useEffect(
    () => () => {
      generation.current++;
    },
    [options.jobId, options.active],
  );

  const ctx = { project, printer };
  const comparison = variants.comparison;
  const candidates = comparison?.candidates.filter((candidate) => candidate.coupon) ?? [];
  const prepared = comparison
    ? {
        coupons: candidates.map((candidate) => candidate.coupon!),
        parts: comparison.parts,
      }
    : cut;
  const report = prepared && fitTestReport(prepared.coupons, prepared.parts, ctx);
  const available =
    options.parameters.status.state !== 'pending' &&
    (canFitTest(parts) || (variants.bindings.length > 0 && parts.length > 1));

  const start = async (): Promise<boolean> => {
    const view = viewport();
    const input = fitTestInput(parts);

    if (!view || cutting || !available) return false;

    const token = ++generation.current;

    setCutting(true);

    try {
      const design = await printReportOf(parts, ctx, view.printShapes);
      const downs = Object.fromEntries(design.parts.map((r) => [r.id, r.check.pose.down]));
      const coupons = await view.fitCoupons({ ...input, downs });
      const byId = new Map(parts.map((p) => [p.id, p]));

      if (!coupons.length && !variants.bindings.length) return false;

      if (
        token !== generation.current ||
        !latest.current.active ||
        latest.current.jobId !== options.jobId ||
        latest.current.partsRef.current !== parts
      )
        return false;

      setCut({ coupons, parts: coupons.map((c, i) => couponPart(c, byId.get(c.host), i)), downs });

      return true;
    } finally {
      setCutting(false);
    }
  };

  return {
    active: !!cut,
    parts: prepared?.parts ?? null,
    variants,
    downs: cut?.downs ?? {},
    report,
    cutting,
    available,
    start,
    leave: () => {
      generation.current++;
      variants.reset();
      setCut(null);
      setCutting(false);
    },
    threeMf: async (plates: PlateFiles): Promise<WrittenPlates> => ({
      files: prepared
        ? (await geometryWorker.call('fitPlateWrite', { ...prepared, plates, comparison: comparison ?? undefined }))
            .files
        : {},
      labels: '',
    }),
  };
}
