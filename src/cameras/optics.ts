import { COMPONENT_BY_ID, specLines, type SpecValue } from '../data/components';
import type { ScenePart } from '../types/robotics';
import { clampLens, type Lens } from './lens';

export const DEFAULT_HFOV_DEG = 70;

const FISHEYE_FROM_DEG = 120;
const FISHEYE_FROM_DIAGONAL_DEG = 140;
const FOUR_THREE_WIDTH_SHARE = 0.8;

const LABEL_ORDER: RegExp[] = [/^(fov|field of view)$/i, /^depth$/i, /^color$/i, /^lens$/i, /^camera$/i, /^stereo$/i];

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

interface Angles {
  horizontal: number;
  diagonal: boolean;
}

function anglesIn(text: string): Angles | null {
  const pair = /(\d+(?:\.\d+)?)\s*°\s*[×x]\s*-?\d/.exec(text);

  if (pair) return { horizontal: Number(pair[1]), diagonal: false };

  const single = /(\d+(?:\.\d+)?)\s*°(\s*diagonal)?/i.exec(text);

  return single ? { horizontal: Number(single[1]), diagonal: Boolean(single[2]) } : null;
}

function lensFromAngles({ horizontal, diagonal }: Angles): Lens {
  if (!diagonal) {
    return horizontal > FISHEYE_FROM_DEG
      ? { model: 'fisheye', fovDeg: horizontal }
      : { model: 'pinhole', hfovDeg: horizontal };
  }

  if (horizontal >= FISHEYE_FROM_DIAGONAL_DEG) return { model: 'fisheye', fovDeg: horizontal * FOUR_THREE_WIDTH_SHARE };

  return { model: 'pinhole', hfovDeg: deg(2 * Math.atan(Math.tan(rad(horizontal) / 2) * FOUR_THREE_WIDTH_SHARE)) };
}

export function specLens(specs: Array<[string, SpecValue]>): Lens | null {
  for (const label of LABEL_ORDER) {
    const row = specs.find(([name]) => label.test(name));
    const angles = row && anglesIn(specLines(row[1]).join(' '));

    if (angles) return clampLens(lensFromAngles(angles));
  }

  return null;
}

export function partLens(part: ScenePart): Lens {
  if (part.cameraLens) return clampLens(part.cameraLens);

  const specs = part.componentId ? (COMPONENT_BY_ID[part.componentId]?.specs ?? []) : [];

  return specLens(specs) ?? { model: 'pinhole', hfovDeg: DEFAULT_HFOV_DEG };
}
