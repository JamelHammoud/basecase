import { cropMask, type Region } from './outlineTrace';
import { maskBounds, type Mask } from './silhouetteProfile';

export type ScaleAxis = 'width' | 'height';

export interface PhotoScale {
  mmPerPx: number;
  partPx: number;
  tightened: boolean;
  subjectMm: [number, number];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function scaleFromPart(
  mask: Mask,
  { region, axis, sizeMm }: { region: Region; axis: ScaleAxis; sizeMm: number },
) {
  const inside = maskBounds(cropMask(mask, region));
  const boxPx = axis === 'width' ? (region.x1 - region.x0) * mask.width : (region.y1 - region.y0) * mask.height;
  const maskPx = axis === 'width' ? inside.x1 - inside.x0 + 1 : inside.y1 - inside.y0 + 1;
  const tightened = inside.x1 >= 0 && maskPx < boxPx * 0.97;
  const partPx = tightened ? maskPx : boxPx;
  const subject = maskBounds(mask);

  if (partPx <= 0 || subject.x1 < 0) return null;

  const mmPerPx = sizeMm / partPx;

  return {
    mmPerPx,
    partPx: Math.round(partPx),
    tightened,
    subjectMm: [r1((subject.x1 - subject.x0 + 1) * mmPerPx), r1((subject.y1 - subject.y0 + 1) * mmPerPx)],
  } satisfies PhotoScale;
}
