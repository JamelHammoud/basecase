import type { Viewport3DHandle } from '../components/Viewport3D';
import type { CameraSpec } from '../three/viewport/fitCapture';
import { blobToDataUrl, imageWorker } from '../utils/imageEncode';
import type { VisionMasks } from '../utils/photoMask';
import { referenceMask } from '../utils/silhouette';
import type { Mask } from '../utils/silhouetteProfile';
import type { Alignment } from '../utils/viewFit';
import { shrinkMask } from '../utils/viewFit';
import { yieldToMain } from '../utils/yieldToMain';

type Payload = Record<string, unknown>;

interface FitContext {
  viewport: () => Viewport3DHandle | null;
}

const SCORE_SIDE = 320;
const ROLLS = [-8, -6, -4, -2, 0, 2, 4, 6, 8];
const ELEVATIONS = [0, 15, 30];

interface Scored {
  spec: CameraSpec;
  align: Alignment;
}

interface Search {
  photo: Mask;
  ids?: string[];
  viewport: Viewport3DHandle;
  tried: Map<string, Scored>;
}

const keyOf = ({ az, el, fov }: CameraSpec) => `${Math.round(az)}|${Math.round(el)}|${Math.round(fov)}`;

async function score(search: Search, spec: CameraSpec, rolls = [0]): Promise<Scored | null> {
  const key = keyOf(spec);
  const cached = search.tried.get(key);

  if (cached && rolls.length === 1) return cached;

  const [shot] = search.viewport.silhouetteShots([spec], { onlyIds: search.ids, maxSide: SCORE_SIDE });

  if (!shot) return null;

  const align = await imageWorker.call('fitScore', { bitmap: shot.bitmap, photo: search.photo, rolls }, [shot.bitmap]);
  const scored = { spec, align };

  search.tried.set(key, scored);
  await yieldToMain();

  return scored;
}

const better = (a: Scored | null, b: Scored | null) => (!a || (b && b.align.iou > a.align.iou) ? b : a);

function coarseSpecs(seed: { az?: number; fov?: number }): CameraSpec[] {
  const azimuths = seed.az === undefined ? [...Array(12).keys()].map((i) => i * 30 - 150) : [-30, -15, 0, 15, 30];
  const fovs = seed.fov ? [seed.fov] : [20, 40, 65];

  return azimuths.flatMap((da) =>
    ELEVATIONS.flatMap((el) => fovs.map((fov) => ({ az: (seed.az ?? 0) + da, el, fov }))),
  );
}

function neighbours({ az, el, fov }: CameraSpec, step: number, fixedFov: boolean): CameraSpec[] {
  const fovs = fixedFov ? [fov] : [fov / (1 + step / 40), fov, fov * (1 + step / 40)];

  return [-step, 0, step].flatMap((da) =>
    [-step / 2, 0, step / 2].flatMap((de) =>
      fovs.map((f) => ({ az: az + da, el: Math.max(-30, Math.min(80, el + de)), fov: Math.max(8, Math.min(90, f)) })),
    ),
  );
}

async function searchCamera(search: Search, seed: { az?: number; fov?: number }): Promise<Scored | null> {
  let best: Scored | null = null;

  for (const spec of coarseSpecs(seed)) best = better(best, await score(search, spec));

  for (const step of [10, 5, 2.5]) {
    if (!best) break;

    const centre: CameraSpec = best.spec;

    for (const spec of neighbours(centre, step, Boolean(seed.fov))) best = better(best, await score(search, spec));
  }

  return best ? better(best, await score(search, best.spec, ROLLS)) : null;
}

async function details(search: Search, best: Scored) {
  const [shot] = search.viewport.silhouetteShots([best.spec], { onlyIds: search.ids, maxSide: SCORE_SIDE });
  const detail = await imageWorker.call('fitDetail', { bitmap: shot.bitmap, photo: search.photo, align: best.align }, [
    shot.bitmap,
  ]);
  const mmPerPhotoPx = shot.mmPerPx / best.align.scale;

  return { shot, detail, mmPerPhotoPx };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

const FULL_FRAME_DIAGONAL = Math.hypot(36, 24);

export function verticalFov(focal35: number, { width, height }: { width: number; height: number }) {
  if (!Number.isFinite(focal35) || focal35 <= 0) return undefined;

  const halfDiagonal = Math.atan(FULL_FRAME_DIAGONAL / (2 * focal35));

  return (2 * Math.atan((Math.tan(halfDiagonal) * height) / Math.hypot(width, height)) * 180) / Math.PI;
}

export async function fitView(payload: Payload, ctx: FitContext) {
  const viewport = ctx.viewport();
  const ids = (payload.ids as string[] | undefined) ?? undefined;
  const found = await referenceMask({
    dataUrl: String(payload.reference),
    masks: (payload.masks as VisionMasks | undefined) ?? null,
    allowCut: Boolean(ids?.length),
  });

  if (!viewport || !found.mask) return { reason: found.reason ?? 'the app has no viewport open' };

  const search: Search = { photo: shrinkMask(found.mask, SCORE_SIDE), ids, viewport, tried: new Map() };
  const seed = {
    az: payload.az === undefined ? undefined : Number(payload.az),
    fov: Number(payload.fov) || verticalFov(Number(payload.focal35), found.mask),
  };
  const best = await searchCamera(search, seed);

  if (!best) return { reason: 'nothing of the model to render' };

  const { shot, detail, mmPerPhotoPx } = await details(search, best);

  return {
    camera: { ...best.spec, roll: best.align.roll, distanceMm: Math.round(shot.distanceMm) },
    seededFov: Boolean(seed.fov),
    renders: search.tried.size + 1,
    iou: Math.round(detail.iou * 1000) / 1000,
    contourMm: r1(detail.contourPx * mmPerPhotoPx),
    photo: detail.photo,
    model: detail.model,
    source: found.source,
    notes: found.notes,
    overlay: await blobToDataUrl(detail.overlay),
  };
}
