import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';

interface LabelContext {
  parts: () => ScenePart[];
  viewport: () => Viewport3DHandle | null;
}

interface LabelRequest {
  views: string[];
  ids?: string[];
  maxSide: number;
  grid: boolean;
}

const labelled = (ids?: string[]) => (p: ScenePart) =>
  p.visible && p.kind !== 'image_plane' && p.role !== 'reference' && (!ids?.length || ids.includes(p.id));

export async function labelledScreenshot({ views, ids, maxSide, grid }: LabelRequest, ctx: LabelContext) {
  const parts = ctx.parts().filter(labelled(ids));
  const order = parts.map((p) => p.id);
  const images = (await ctx.viewport()?.captureViews(views, ids, { maxSide, grid, labels: order })) ?? [];

  return {
    images,
    legend: parts.map((p, i) => ({ label: i + 1, id: p.id, name: p.name })),
  };
}
