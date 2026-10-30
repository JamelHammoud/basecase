import type { ScenePart } from '../types/robotics';
import { boxDiagonal, unionBox } from './guideMath';
import { buildItems, buildTools, firstUseOrder } from './guideItems';
import { buildModules } from './guideModules';
import type { PlanContext } from './guideOrder';
import { buildSteps } from './guideSequence';
import type { GuidePlan, GuideScene, GuideStep, GuideTool } from './guideTypes';

const NOT_BUILT = new Set(['image_plane', 'hole_cylinder', 'hole_box', 'pivot_axis']);

export const isBuilt = (p: ScenePart) => p.visible && p.role === 'solid' && !NOT_BUILT.has(p.kind);

function stepTools(step: GuideStep, tools: GuideTool[]): string[] {
  const keys = new Set(step.callout.map((c) => c.key));

  return tools.filter((t) => t.icon !== 'printer' && t.itemKeys.some((k) => keys.has(k))).map((t) => t.id);
}

export function buildGuidePlan(scene: GuideScene, material: string): GuidePlan {
  const parts = scene.parts.filter(isBuilt);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const ctx: PlanContext = {
    byId,
    boxes: scene.boxes,
    contacts: scene.contacts,
    axes: scene.axes,
    order: scene.order
      ? { rank: new Map(scene.order.assembly.map((id, i) => [id, i])), unproven: new Set(scene.order.unproven) }
      : undefined,
    size: Math.max(boxDiagonal(unionBox(parts.flatMap((p) => (scene.boxes[p.id] ? [scene.boxes[p.id]] : [])))), 1),
  };
  const modules = buildModules({ ...scene, parts }, parts);
  const raw = buildSteps(ctx, modules);
  const items = buildItems(parts, firstUseOrder(raw, parts));
  const tools = buildTools(items, material);

  return {
    title: scene.title,
    items,
    tools,
    modules,
    steps: raw.map((s) => ({ ...s, tools: stepTools(s, tools) })),
    partIds: parts.map((p) => p.id),
  };
}
