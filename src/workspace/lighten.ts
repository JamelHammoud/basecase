import type { Viewport3DHandle } from '../components/Viewport3D';
import type { LightenResult } from '../strength/lighten';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { isMadePart } from '../utils/bom';
import { errorMessage } from '../utils/errorMessage';
import { percent } from '../../electron/percent.mjs';
import { lightenLoads } from './lightenLoads';
import { withSculptMesh } from './sculptEdits';
import type { CommitParts } from './types';

export interface LightenOptions {
  targetShare?: number;
  minWallMm?: number;
}

export interface LightenContext {
  parts: () => ScenePart[];
  project: () => ProjectSettings;
  viewport: () => Viewport3DHandle | null;
  commitParts: CommitParts;
  current?: () => boolean;
}

export const canLighten = (part: ScenePart) => isMadePart(part) && part.visible && !part.locked;

function sameLightenProject(before: ProjectSettings, after: ProjectSettings): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as Array<keyof ProjectSettings>);

  return [...keys].every((key) => key === 'tries' || key === 'triesStored' || before[key] === after[key]);
}

export function lightenedPart(part: ScenePart, result: LightenResult): ScenePart {
  const { width, height, depth } = part.dimensions;
  const scale = [width, height, depth];
  const sculptMesh = { positions: Array.from(result.positions, (v, i) => v / scale[i % 3]) };
  const cad = part.cad && { ...part.cad, audit: undefined, volume: undefined, pending: undefined };

  return {
    ...withSculptMesh(part, sculptMesh),
    sheetTransform: part.sheetTransform,
    cad,
    mesh: undefined,
    sketch: undefined,
    massG: undefined,
    com: undefined,
  };
}

export async function applyLighten(ctx: LightenContext, options: LightenOptions & { id: string }) {
  const parts = ctx.parts();
  const project = ctx.project();
  const part = parts.find((p) => p.id === options.id);
  const viewport = ctx.viewport();
  const { targetShare = 0.5, minWallMm = 1.5 } = options;
  const stale = () => ctx.parts() !== parts || !sameLightenProject(project, ctx.project()) || ctx.current?.() === false;

  if (!part || !canLighten(part)) return { text: 'Choose a visible, unlocked printed solid to lighten.' };

  if (!viewport) return { text: 'Open the canvas to lighten this part.' };

  if (!Number.isFinite(targetShare) || targetShare <= 0 || targetShare >= 1)
    return { text: 'Set the target mass between 0% and 100%.' };

  if (!Number.isFinite(minWallMm) || minWallMm < 1) return { text: 'Choose a minimum wall of at least 1 mm.' };

  try {
    const loads = await lightenLoads(viewport, parts, project, part.id);

    if (stale()) return { text: 'The scene changed. Run Lighten again.' };

    const result = await viewport.lightenPart({
      part: part.id,
      ...loads,
      targetShare,
      minWallMm,
      shapeTransform: part.sheetTransform,
    });

    if (stale()) return { text: 'The scene changed. Run Lighten again.' };

    ctx.commitParts((current) => current.map((p) => (p.id === part.id ? lightenedPart(p, result) : p)));

    return { text: `Lightened ${part.name} to ${percent(result.massShare)} of its original mass.`, result };
  } catch (err) {
    return { text: errorMessage(err) };
  }
}
