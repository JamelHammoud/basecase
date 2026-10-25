import type { ProjectSettings, ScenePart } from '../types/robotics';
import { solidSizeMm } from '../utils/sceneSize';
import { guideHtml } from './doc/guideDocument';
import { buildGuidePlan } from './guidePlan';
import type { GuidePlan } from './guideTypes';
import { guideCache } from './render/guideCache';
import { drawGuide } from './render/guideDrawings';
import { measureGuideScene } from './render/guideMeasure';
import { GuideRenderer } from './render/guideRenderer';
import { blobDataUrl } from './render/guideStage';

export interface GuideProgress {
  share: number;
  label: string;
}

export interface GuideJob {
  guideId: string;
  title: string;
  parts: ScenePart[];
  partKeys: Record<string, string>;
  project: ProjectSettings;
  date: string;
  mark: string;
}

export interface GuideJobEvents {
  onProgress: (p: GuideProgress) => void;
  onCover: (dataUrl: string) => void;
  isCancelled: () => boolean;
}

export interface RenderedGuide {
  html: string;
  pages: number;
  plan: GuidePlan;
  coverDataUrl: string;
}

const COVER_THUMB_PX = 360;
const MEASURE_SHARE = 0.15;
const DRAW_SHARE = 0.8;
const RENDERER_IDLE_MS = 120_000;
const MAX_HELD = 2;

interface Held {
  renderer: GuideRenderer;
  idle?: ReturnType<typeof setTimeout>;
}

const held = new Map<string, Held>();
const running = new Set<string>();

function drop(guideId: string) {
  const known = held.get(guideId);

  clearTimeout(known?.idle);
  held.delete(guideId);
  known?.renderer.dispose();
}

function makeRoom() {
  const idle = [...held.keys()].filter((id) => !running.has(id));

  while (held.size >= MAX_HELD && idle.length) drop(idle.shift()!);
}

function takeRenderer(guideId: string): GuideRenderer {
  const known = held.get(guideId);

  clearTimeout(known?.idle);

  if (known) return known.renderer;

  makeRoom();

  const renderer = new GuideRenderer();

  held.set(guideId, { renderer });

  return renderer;
}

function releaseLater(guideId: string) {
  const known = held.get(guideId);

  if (!known) return;

  known.idle = setTimeout(() => drop(guideId), RENDERER_IDLE_MS);
}

async function coverThumbnail(dataUrl: string): Promise<string> {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const k = Math.min(1, COVER_THUMB_PX / Math.max(image.width, image.height));
  const canvas = new OffscreenCanvas(Math.round(image.width * k), Math.round(image.height * k));

  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  return blobDataUrl(await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 }));
}

async function renderWith(renderer: GuideRenderer, job: GuideJob, events: GuideJobEvents) {
  const { title, parts, project, isCancelled } = { ...job, ...events };
  const cache = guideCache(job.guideId);

  cache.begin(job.partKeys);
  events.onProgress({ share: 0.02, label: 'Measuring parts' });
  await renderer.sync(parts, job.partKeys);

  const geometry = await measureGuideScene(renderer, { cache, isCancelled });

  if (isCancelled()) return null;

  const plan = buildGuidePlan({ title, parts, joints: project.joints ?? [], ...geometry }, project.material);

  events.onProgress({ share: MEASURE_SHARE, label: 'Drawing steps' });

  const drawings = await drawGuide(
    { renderer, plan, cache, boxes: geometry.boxes },
    {
      isCancelled,
      onCover: (cover) => void coverThumbnail(cover.dataUrl).then(events.onCover, () => undefined),
      onProgress: ({ done, total }) =>
        events.onProgress({
          share: MEASURE_SHARE + (DRAW_SHARE * done) / total,
          label: `Drawing step ${Math.max(1, done - 2)} of ${plan.steps.length}`,
        }),
    },
  );

  if (!drawings) return null;

  cache.commit();

  const meta = {
    title,
    material: project.material,
    infillPct: project.infillPct,
    date: job.date,
    sizeMm: solidSizeMm(parts) ?? undefined,
    mark: job.mark,
  };
  const { html, pages } = guideHtml({ plan, drawings, meta });

  return { html, pages, plan, coverDataUrl: await coverThumbnail(drawings.cover.dataUrl) };
}

export async function renderGuide(job: GuideJob, events: GuideJobEvents): Promise<RenderedGuide | null> {
  if (!job.parts.length) return null;

  const renderer = takeRenderer(job.guideId);

  running.add(job.guideId);

  try {
    return await renderWith(renderer, job, events);
  } catch (error) {
    drop(job.guideId);

    throw error;
  } finally {
    running.delete(job.guideId);
    releaseLater(job.guideId);
  }
}
