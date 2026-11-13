import { COMPONENT_BY_ID } from '../data/components';
import { heatInsert, type HardwareType } from '../data/hardware';
import type { FitCoupon, FitSpec } from '../three/analysis/fitCoupons';
import { PRINT_RULES } from '../three/printability';
import type { ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';
import { isScrew } from '../utils/designedFits';
import { reportFromShapes, type PrintContext, type PrintReport } from '../utils/printReport';

const POCKETED = new Set(['Servos', 'Motors']);
const BEARINGS = new Set<HardwareType>(['bearing', 'flanged_bearing', 'thrust_bearing', 'linear_bearing']);

function componentKey(p: ScenePart): string | null {
  const group = p.componentId ? COMPONENT_BY_ID[p.componentId]?.group : undefined;

  return group && POCKETED.has(group) ? `servo:${p.componentId}` : null;
}

function hardwareKey(p: ScenePart): string | null {
  const spec = p.hardware;

  if (!spec) return null;

  if (spec.type === 'heat_insert') {
    const insert = heatInsert(spec);

    return `insert:${spec.size}|${insert.l}|${insert.od}`;
  }

  if (BEARINGS.has(spec.type)) return `bearing:${spec.type}|${spec.size}`;

  return isScrew(p) ? `screw:${spec.size}` : null;
}

export function fitKey(p: ScenePart): string | null {
  if (p.kind === 'component') return componentKey(p);

  return p.kind === 'hardware' ? hardwareKey(p) : null;
}

export function fitTestInput(parts: ScenePart[]): { fits: FitSpec[]; hosts: string[] } {
  const hosts = parts.filter((p) => isPrinted(p) && !p.print?.skip).map((p) => p.id);
  const fits = parts.flatMap((p) => {
    const key = fitKey(p);

    return key ? [{ id: p.id, key }] : [];
  });

  return { fits, hosts };
}

export const canFitTest = (parts: ScenePart[]) => {
  const { fits, hosts } = fitTestInput(parts);

  return fits.length > 0 && hosts.length > 0;
};

export function couponPart(coupon: FitCoupon, host: ScenePart | undefined, index: number): ScenePart {
  return {
    id: `fit-test-${index + 1}`,
    name: host?.name ?? coupon.key,
    kind: 'sculpt_mesh',
    category: 'custom_models',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 1, height: 1, depth: 1 },
    color: host?.color ?? '#e4e4e7',
    note: '',
    mechanicalTag: host?.mechanicalTag,
    printMaterial: host?.printMaterial,
    visible: true,
    locked: false,
    sculptMesh: { positions: Array.from(coupon.positions) },
    print: { down: coupon.pose.down },
  };
}

export function fitTestReport(coupons: FitCoupon[], parts: ScenePart[], ctx: PrintContext): PrintReport {
  return reportFromShapes(
    coupons.map((coupon, i) => ({
      part: parts[i],
      shape: {
        check: { poses: [coupon.pose], minWallMm: PRINT_RULES.minWallMm, thinShare: 0, thinAreaMm2: 0 },
        measure: coupon.measure,
      },
    })),
    ctx,
  );
}
