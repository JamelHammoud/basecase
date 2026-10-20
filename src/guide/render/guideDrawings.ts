import { boxCenter, unionBox } from '../guideMath';
import { type GuidePlan, type GuideStep, type V3 } from '../guideTypes';
import { VIEW_DIRECTIONS, type ViewName } from './guideCamera';
import type { DrawRequest, Drawing, GuideRenderer } from './guideRenderer';

export interface StepDrawing {
  main: Drawing;
  view: ViewName;
  detail?: Drawing & { anchor: [number, number] };
}

export interface ItemDrawing {
  thumb: Drawing;
  actual?: { dataUrl: string; widthMm: number; heightMm: number };
}

export interface GuideDrawings {
  cover: Drawing;
  items: Record<string, ItemDrawing>;
  modules: Record<string, Drawing>;
  steps: StepDrawing[];
}

export interface DrawProgress {
  done: number;
  total: number;
}

const STEP_PX = 1500;
const COVER_PX = 1700;
const THUMB_PX = 300;
const MODULE_PX = 420;
const DETAIL_PX = 460;
const ACTUAL_PX_PER_MM = 12;
const HIDDEN_SHARE = 0.45;
const BETTER_BY = 0.2;
const SMALL_SHARE = 0.09;
const MAX_ZOOM = 2.2;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

type Boxes = Record<string, { min: V3; max: V3 }>;

function chooseView(renderer: GuideRenderer, req: Pick<DrawRequest, 'ids' | 'newIds' | 'offsets'>): ViewName {
  const front = renderer.visibleShare(req, VIEW_DIRECTIONS.front);

  if (front >= HIDDEN_SHARE) return 'front';

  const others = (['back', 'left', 'right'] as const).map((v) => ({
    v,
    share: renderer.visibleShare(req, VIEW_DIRECTIONS[v]),
  }));
  const best = others.reduce((a, b) => (b.share > a.share ? b : a));

  return best.share > front + BETTER_BY ? best.v : 'front';
}

function moduleFinal(plan: GuidePlan, step: GuideStep): string[] | undefined {
  if (step.kind === 'attach') return undefined;

  const last = plan.steps.findLast((s) => s.moduleId === step.moduleId && s.kind !== 'attach');

  return last ? [...last.contextIds, ...last.partIds] : undefined;
}

function offsetsOf(step: GuideStep): Map<string, V3> {
  return new Map(step.moves.map((m) => [m.partId, m.offset]));
}

function movedCenter(step: GuideStep, boxes: Boxes): V3 {
  const offsets = offsetsOf(step);
  const moved = step.partIds.map((id) => {
    const b = boxes[id];
    const o = offsets.get(id) ?? [0, 0, 0];

    return { min: b.min.map((v, i) => v + o[i]) as V3, max: b.max.map((v, i) => v + o[i]) as V3 };
  });

  return boxCenter(unionBox(moved));
}

function needsDetail(main: Drawing, step: GuideStep, boxes: Boxes): boolean {
  if (step.kind === 'attach' || !step.contextIds.length || !step.moves.length) return false;

  const ids = step.partIds.filter((id) => boxes[id]);

  if (!ids.length) return false;

  const [a, b] = main.points;

  return Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) < Math.max(main.width, main.height) * SMALL_SHARE;
}

function newBounds(step: GuideStep, boxes: Boxes): V3[] {
  const offsets = offsetsOf(step);
  const corners = step.partIds.flatMap((id) => {
    const b = boxes[id];
    const o = offsets.get(id) ?? [0, 0, 0];

    return b ? [b.min.map((v, i) => v + o[i]) as V3, b.max.map((v, i) => v + o[i]) as V3] : [];
  });
  const u = unionBox(corners.map((c) => ({ min: c, max: c })));

  return [u.min, u.max];
}

function drawStep(renderer: GuideRenderer, plan: GuidePlan, index: number, boxes: Boxes): StepDrawing {
  const step = plan.steps[index];
  const base = { ids: [...step.contextIds, ...step.partIds], newIds: new Set(step.partIds), offsets: offsetsOf(step) };
  const view = chooseView(renderer, base);
  const dir = VIEW_DIRECTIONS[view];
  const cap = moduleFinal(plan, step);
  const focus = movedCenter(step, boxes);
  const main = renderer.draw({
    ...base,
    dir,
    maxWidth: STEP_PX,
    maxHeight: STEP_PX,
    capIds: cap,
    capZoom: MAX_ZOOM,
    arrows: step.arrows,
    points: [...newBounds(step, boxes), focus],
  });

  if (!needsDetail(main, step, boxes)) return { main, view };

  const detail = renderer.draw({
    ...base,
    dir,
    frameIds: step.partIds,
    maxWidth: DETAIL_PX,
    maxHeight: DETAIL_PX,
    arrows: step.arrows,
  });
  const anchor = renderer.draw({
    ...base,
    dir,
    maxWidth: main.width,
    maxHeight: main.height,
    capIds: cap,
    capZoom: MAX_ZOOM,
    points: [focus],
  }).points[0];

  return { main, view, detail: { ...detail, anchor } };
}

function drawItems(renderer: GuideRenderer, plan: GuidePlan): Record<string, ItemDrawing> {
  return Object.fromEntries(
    plan.items.map((item) => {
      const one = new Set([item.sample]);
      const thumb = renderer.draw({ ids: [item.sample], newIds: one, maxWidth: THUMB_PX, maxHeight: THUMB_PX });
      const actual = item.kind === 'hardware' ? renderer.drawActualSize(item.sample, ACTUAL_PX_PER_MM) : null;

      return [item.key, { thumb, actual: actual ?? undefined }];
    }),
  );
}

function drawModules(renderer: GuideRenderer, plan: GuidePlan): Record<string, Drawing> {
  const attaching = plan.steps.filter((s) => s.attach);

  return Object.fromEntries(
    attaching.map((s) => {
      const ids = s.partIds;

      return [s.attach!, renderer.draw({ ids, newIds: new Set(ids), maxWidth: MODULE_PX, maxHeight: MODULE_PX })];
    }),
  );
}

export async function drawGuide(
  renderer: GuideRenderer,
  plan: GuidePlan,
  boxes: Boxes,
  options: { onProgress: (p: DrawProgress) => void; isCancelled: () => boolean },
): Promise<GuideDrawings | null> {
  const total = plan.steps.length + 2;
  const all = new Set(plan.partIds);
  const cover = renderer.draw({ ids: plan.partIds, newIds: all, maxWidth: COVER_PX, maxHeight: COVER_PX });

  options.onProgress({ done: 1, total });
  await nextFrame();

  const items = drawItems(renderer, plan);
  const modules = drawModules(renderer, plan);
  const steps: StepDrawing[] = [];

  options.onProgress({ done: 2, total });

  for (let i = 0; i < plan.steps.length; i++) {
    if (options.isCancelled()) return null;

    await nextFrame();
    steps.push(drawStep(renderer, plan, i, boxes));
    options.onProgress({ done: i + 3, total });
  }

  return { cover, items, modules, steps };
}
