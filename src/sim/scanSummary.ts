import type { ScenePart } from '../types/robotics';
import { scanAngles } from './lidar';
import { angle } from '../utils/angle';
import type { SimModel } from './mjcfTypes';
import type { Scan } from './scanner';

function bearing(deg: number): string {
  const a = Math.round(deg);

  if (a === 0) return 'straight ahead';

  if (Math.abs(a) >= 180) return 'behind';

  return `${angle(Math.abs(a))} ${a > 0 ? 'left' : 'right'}`;
}

export function scanSummary(model: SimModel | null, scan: Scan | null, parts: ScenePart[]): string[] {
  if (!model?.scans?.length || !scan) return [];

  let at = 0;

  return model.scans.map((eye) => {
    const values = scan.values.subarray(at, at + eye.cols);
    const name = parts.find((p) => p.id === eye.part)?.name ?? eye.part;
    const angles = scanAngles({ rays: eye.cols, fovDeg: eye.scan?.fovDeg ?? 360 });
    let nearest = -1;
    let hits = 0;

    at += eye.cols;
    values.forEach((v, i) => {
      if (v >= 1) return;

      hits++;

      if (nearest < 0 || v < values[nearest]) nearest = i;
    });

    if (nearest < 0) return `${name}: no return within ${eye.rangeM} m.`;

    const metres = (values[nearest] * eye.rangeM).toFixed(2);

    return `${name}: nearest return ${metres} m, ${bearing(angles[nearest])}; ${hits} of ${eye.cols} rays return within ${eye.rangeM} m.`;
  });
}
