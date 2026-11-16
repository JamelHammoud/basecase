import type { GalleryBundle } from '../gallery/galleryBundle';
import type { MeshMeasure } from '../three/meshMeasure';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildBom } from '../utils/bom';

const finiteMeasure = (measure: MeshMeasure | undefined) =>
  !measure ||
  (Number.isFinite(measure.volumeMm3) &&
    measure.volumeMm3 > 0 &&
    Number.isFinite(measure.areaMm2) &&
    measure.areaMm2 > 0 &&
    [...measure.min, ...measure.max].every(Number.isFinite));

export function leagueBudget(
  bundle: GalleryBundle,
  measures: Record<string, MeshMeasure | undefined>,
  manifest: { deadline: string },
): number | null {
  const parts = bundle.robot.parts.filter((part) => part.role === 'solid');

  if (!parts.length || parts.some((part) => !finiteMeasure(measures[part.id]))) return null;

  const bom = buildBom({
    parts,
    project: { ...DEFAULT_PROJECT, joints: bundle.robot.joints },
    purchases: {},
    measures,
    now: new Date(manifest.deadline),
  });
  const covered = new Set([...bom.lines.flatMap((line) => line.partIds), ...bom.printed.map((part) => part.id)]);
  const incomplete =
    bom.unmeasured.length ||
    bom.standIns.length ||
    bom.madeElsewhere.length ||
    bom.totals.unpriced ||
    parts.some((part) => !covered.has(part.id));

  if (incomplete || !Number.isFinite(bom.totals.estimatedUsd)) return null;

  return bom.totals.estimatedUsd;
}
