import { snapshotScene } from '../agent/agentScene';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import { encodeBitmap } from '../utils/imageEncode';
import { checkMask, decodeVisionMasks, pickSubject, type VisionMasks } from '../utils/photoMask';
import { floodMaskOf, imageData } from '../utils/silhouette';
import { maskBounds, thresholdMask, type Mask } from '../utils/silhouetteProfile';
import { fitTarget, overlayPixels, type TargetFit } from '../utils/targetFit';

type Payload = Record<string, unknown>;

interface TargetContext {
  parts: () => ScenePart[];
  viewport: () => Viewport3DHandle | null;
}

const RASTER_SIDE = 900;
const VERTICAL_AXIS: Record<string, number> = { top: 1 };

export function modelExtent(parts: ScenePart[], view: string, ids?: string[]): { lo: number; hi: number } | null {
  const axis = VERTICAL_AXIS[view] ?? 2;
  const shown = snapshotScene(parts).parts.filter(
    (p) => p.role !== 'reference' && p.role !== 'cutout' && (!ids?.length || ids.includes(p.id)),
  );
  const visible = shown.filter((p) => parts.find((q) => q.id === p.id)?.visible !== false);

  if (!visible.length) return null;

  return {
    lo: Math.min(...visible.map((p) => p.bounds.min[axis])),
    hi: Math.max(...visible.map((p) => p.bounds.max[axis])),
  };
}

function modelHeightMm(parts: ScenePart[], view: string, ids?: string[]): number {
  const extent = modelExtent(parts, view, ids);

  return extent ? extent.hi - extent.lo : 0;
}

export async function modelMask(view: string, ids: string[] | undefined, ctx: TargetContext): Promise<Mask | null> {
  const [shot] = (await ctx.viewport()?.captureViews([view], ids, { silhouette: true })) ?? [];

  if (!shot) return null;

  const { data, width, height } = await imageData(shot.dataUrl, 1200);
  const red = new Uint8Array(width * height);

  for (let i = 0; i < red.length; i++) red[i] = data[i * 4];

  return thresholdMask(red, width, height);
}

async function targetMask(payload: Payload): Promise<{ mask?: Mask; rasterHeight: number; reason?: string }> {
  const pixels = await imageData(String(payload.reference), RASTER_SIDE, '#ffffff');
  const flood = floodMaskOf(pixels);
  const masks = payload.masks as VisionMasks | undefined;
  const visionMask = () => (masks?.instances.length ? pickSubject(decodeVisionMasks(masks))?.mask : undefined);
  const mask = flood.mask ?? visionMask();

  if (!mask) return { rasterHeight: pixels.height, reason: flood.reason ?? 'no outline found' };

  const refused = checkMask(mask).refused;

  return refused ? { rasterHeight: pixels.height, reason: refused } : { mask, rasterHeight: pixels.height };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function summary(fit: TargetFit) {
  return {
    iou: Math.round(fit.iou * 1000) / 1000,
    scaledToHeight: fit.scaledToHeight,
    targetSize: fit.targetSize.map(r1),
    modelSize: fit.modelSize.map(r1),
    bands: fit.bands.map((b) => ({ band: b.band, targetMm: r1(b.targetMm), modelMm: r1(b.modelMm) })),
    gapMeanMm: r1(fit.gapMeanMm),
    gapMaxMm: r1(fit.gapMaxMm),
    corners: {
      target: { top: r1(fit.corners.target.top), bottom: r1(fit.corners.target.bottom) },
      model: { top: r1(fit.corners.model.top), bottom: r1(fit.corners.model.bottom) },
    },
  };
}

export async function targetCompare(payload: Payload, ctx: TargetContext) {
  const view = String(payload.view ?? 'front');
  const ids = (payload.ids as string[] | undefined) ?? undefined;
  const heightMm = modelHeightMm(ctx.parts(), view, ids);
  const model = await modelMask(view, ids, ctx);
  const target = await targetMask(payload);

  if (!target.mask) return { reason: target.reason };

  const box = model ? maskBounds(model) : null;

  if (!model || !box || box.y1 < box.y0 || heightMm <= 0) return { reason: 'nothing of the model to render' };

  const svgHeightMm = Number(payload.heightMm) || 0;
  const fit = fitTarget({
    target: target.mask,
    model: { mask: model, mmPerPx: heightMm / (box.y1 - box.y0 + 1) },
    targetMmPerPx: svgHeightMm > 0 ? svgHeightMm / target.rasterHeight : null,
  });

  if (!fit) return { reason: 'no outline found' };

  const bitmap = await createImageBitmap(overlayPixels(fit.grid));

  return { view, fit: summary(fit), overlay: await encodeBitmap({ bitmap, type: 'image/png' }) };
}
