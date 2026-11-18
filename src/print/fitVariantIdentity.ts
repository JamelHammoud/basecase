import type { FitComparison } from './fitVariants';
import type { ThreeMfFileSpec } from '../three/analysis/plateFiles';
import type { ParameterDesign } from '../utils/designParameters/mutations';
import type { ScenePart } from '../types/robotics';
import { plateOrigin, threeMfBuildMatrix } from './threeMf';

export interface FitPlateIdentity {
  version: 1;
  kind: 'design-choice';
  down: [number, number, number];
  material: string;
  sourceSha256: string;
  binding: FitComparison['request']['binding'];
  parameters: FitComparison['source']['parameters'];
  interface: ScenePart;
  candidates: Array<{
    id: string;
    value: number;
    unit: 'mm';
    reason?: string;
    host?: string;
    fit?: string;
    key?: string;
    down?: number[];
    material?: string;
    objects: Array<{ id: number; plate: number; matrix: number[] }>;
  }>;
}

export async function fitSourceHash(design: ParameterDesign): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ parts: design.parts, parameters: design.parameters }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

export function fitPlateIdentity(
  comparison: FitComparison,
  file: ThreeMfFileSpec,
  plateSize: [number, number],
): FitPlateIdentity {
  const fit = comparison.source.parts.find((p) => p.id === comparison.request.fit)!;
  const plateIndex = new Map(file.plates.map((plate, index) => [plate.number, index]));

  return {
    version: 1,
    kind: 'design-choice',
    down: comparison.request.down,
    material: comparison.request.material,
    sourceSha256: comparison.sourceSha256,
    binding: comparison.request.binding,
    parameters: comparison.source.parameters,
    interface: fit,
    candidates: comparison.candidates.map((candidate) => ({
      id: candidate.id,
      value: candidate.value,
      unit: 'mm',
      reason: candidate.reason,
      host: candidate.coupon?.host,
      fit: candidate.coupon?.fit,
      key: candidate.coupon?.key,
      down: candidate.coupon?.pose.down,
      material: comparison.request.material,
      objects: file.items.flatMap((item, i) =>
        item.id === candidate.id
          ? [
              {
                id: i + 1,
                plate: item.plate,
                matrix: threeMfBuildMatrix(
                  item.matrix,
                  plateOrigin(plateIndex.get(item.plate) ?? 0, file.plates.length, plateSize),
                ),
              },
            ]
          : [],
      ),
    })),
  };
}
