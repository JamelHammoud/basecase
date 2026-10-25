import { boxCenter, unionBox } from '../guideMath';
import { type GuidePlan, type GuideStep, type V3 } from '../guideTypes';
import { VIEW_DIRECTIONS, type ViewName } from './guideCamera';
import type { GuideCache } from './guideCache';
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

function movedCenter(step: GuideStep, ids: string[], boxes: Boxes): V3 {
  const offsets = offsetsOf(step);
  const moved = ids.map((id) => {
    const b = boxes[id];
    const o = offsets.get(id) ?? [0, 0, 0];

    return { min: b.min.map((v, i) => v + o[i]) as V3, max: b.max.map((v, i) => v + o[i]) as V3 };
  });

  return boxCenter(unionBox(moved));
}

function needsDetail(main: Drawing, step: GuideStep, fasteners: string[]): boolean {
  if (step.kind === 'attach' || !step.contextIds.length || !fasteners.length) return false;

  const [a, b] = main.points;

  return Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) < Math.max(main.width, main.height) * SMALL_SHARE;
}

function newBounds(step: GuideStep, ids: string[], boxes: Boxes): V3[] {
  const offsets = offsetsOf(step);
  const corners = ids.flatMap((id) => {
    const b = boxes[id];
    const o = offsets.get(id) ?? [0, 0, 0];

    return b ? [b.min.map((v, i) => v + o[i]) as V3, b.max.map((v, i) => v + o[i]) as V3] : [];
  });
  const u = unionBox(corners.map((c) => ({ min: c, max: c })));

  return [u.min, u.max];
}

function screwIds(plan: GuidePlan): Set<string> {
  return new Set(
    plan.items.filter((i) => i.kind === 'hardware' && i.hardware?.type !== 'heat_insert').flatMap((i) => i.partIds),
  );
}

function drawStep(renderer: GuideRenderer, plan: GuidePlan, index: number, boxes: Boxes): StepDrawing {
  const screws = screwIds(plan);
  const step = plan.steps[index];
  const base = { ids: [...step.contextIds, ...step.partIds], newIds: new Set(step.partIds), offsets: offsetsOf(step) };
  const view = chooseView(renderer, base);
  const dir = VIEW_DIRECTIONS[view];
  const cap = moduleFinal(plan, step);
  const fasteners = step.partIds.filter((id) => screws.has(id) && boxes[id]);
  const watched = fasteners.length ? fasteners : step.partIds.filter((id) => boxes[id]);
  const focus = movedCenter(step, watched, boxes);
  const main = renderer.draw({
    ...base,
    dir,
    maxWidth: STEP_PX,
    maxHeight: STEP_PX,
    capIds: cap,
    capZoom: MAX_ZOOM,
    arrows: step.arrows,
    points: [...newBounds(step, watched, boxes), focus],
  });

  if (!needsDetail(main, step, fasteners)) return { main, view };

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

  return { main, view, detail: Object.assign(detail, { anchor }) };
}

function stepKey(plan: GuidePlan, step: GuideStep, cache: GuideCache): string {
  const screws = screwIds(plan);
  const cap = moduleFinal(plan, step) ?? [];
  const shape = {
    kind: step.kind,
    partIds: step.partIds,
    contextIds: step.contextIds,
    moves: step.moves,
    arrows: step.arrows,
    cap,
    screws: step.partIds.filter((id) => screws.has(id)),
  };

  return `step|${JSON.stringify(shape)}|${cache.partsKey(new Set([...step.contextIds, ...step.partIds, ...cap]))}`;
}

interface DrawContext {
  renderer: GuideRenderer;
  plan: GuidePlan;
  cache: GuideCache;
}

async function drawItems({ renderer, plan, cache }: DrawContext): Promise<Record<string, ItemDrawing>> {
  const out: Record<string, ItemDrawing> = {};

  for (const item of plan.items) {
    await renderer.ready();
    out[item.key] = cache.take(`item|${item.kind}|${cache.partsKey([item.sample])}`, () => {
      const one = new Set([item.sample]);
      const thumb = renderer.draw({ ids: [item.sample], newIds: one, maxWidth: THUMB_PX, maxHeight: THUMB_PX });
      const actual = item.kind === 'hardware' ? renderer.drawActualSize(item.sample, ACTUAL_PX_PER_MM) : null;

      return { thumb, actual: actual ?? undefined };
    });
  }

  return out;
}

async function drawModules({ renderer, plan, cache }: DrawContext): Promise<Record<string, Drawing>> {
  const out: Record<string, Drawing> = {};

  for (const step of plan.steps.filter((s) => s.attach)) {
    const ids = step.partIds;

    await renderer.ready();
    out[step.attach!] = cache.take(`module|${cache.partsKey(ids)}`, () =>
      renderer.draw({ ids, newIds: new Set(ids), maxWidth: MODULE_PX, maxHeight: MODULE_PX }),
    );
  }

  return out;
}

export interface DrawGuideOptions {
  onProgress: (p: DrawProgress) => void;
  onCover?: (cover: Drawing) => void;
  isCancelled: () => boolean;
}

export async function drawGuide(
  ctx: DrawContext & { boxes: Boxes },
  options: DrawGuideOptions,
): Promise<GuideDrawings | null> {
  const { renderer, plan, cache, boxes } = ctx;
  const total = plan.steps.length + 2;
  const all = new Set(plan.partIds);
  const cover = cache.take(`cover|${cache.partsKey(all)}`, () =>
    renderer.draw({ ids: plan.partIds, newIds: all, maxWidth: COVER_PX, maxHeight: COVER_PX }),
  );

  await renderer.flush();
  options.onCover?.(cover);
  options.onProgress({ done: 1, total });

  const items = await drawItems(ctx);
  const modules = await drawModules(ctx);
  const steps: StepDrawing[] = [];

  options.onProgress({ done: 2, total });

  for (let i = 0; i < plan.steps.length; i++) {
    await renderer.ready();

    if (options.isCancelled()) return null;

    steps.push(cache.take(stepKey(plan, plan.steps[i], cache), () => drawStep(renderer, plan, i, boxes)));
    options.onProgress({ done: i + 3, total });
  }

  await renderer.flush();

  return { cover, items, modules, steps };
}
