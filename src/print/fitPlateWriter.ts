import { plateFiles, type PlateFilesInput } from '../three/analysis/plateFiles';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { place } from '../three/analysis/collide';
import { Matrix4 } from 'three';
import type { FitCoupon } from '../three/analysis/fitCoupons';
import type { ScenePart } from '../types/robotics';
import type { FitComparison } from './fitVariants';
import { couponPart } from './fitTest';
import { fitPlateIdentity } from './fitVariantIdentity';

export interface FitPlateWrite {
  coupons: FitCoupon[];
  parts: ScenePart[];
  plates: PlateFilesInput;
  comparison?: FitComparison;
}

export function fitComparisonParts(comparison: FitComparison) {
  const host = comparison.source.parts.find((p) => p.id === comparison.request.binding.host);

  return comparison.candidates
    .filter((candidate) => candidate.coupon)
    .map((candidate, index) => ({
      ...couponPart(candidate.coupon!, host, index),
      id: candidate.id,
      printMaterial: comparison.request.material,
      name: `${comparison.request.binding.parameter} = ${candidate.value} mm`,
    }));
}

export async function writeFitPlate(input: FitPlateWrite) {
  const { coupons, parts, plates, comparison } = input;
  const solids = new Map(parts.map((part, i) => [part.id, new ShapeSolid(coupons[i].positions)]));

  try {
    const files = plates.files.map((file) => ({
      ...file,
      fitTest: comparison ? fitPlateIdentity(comparison, file) : undefined,
    }));

    return await plateFiles(
      {
        ...plates,
        files,
        instances: parts.map((p) => ({
          id: p.id,
          key: p.id,
          matrix: new Matrix4().toArray(),
        })),
      },
      {
        solidOf: (key) => solids.get(key)!,
        placeAll: () => parts.map((p) => place(p.id, solids.get(p.id)!, new Matrix4())),
      },
    );
  } finally {
    solids.forEach((solid) => solid.dispose());
  }
}
