import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import { cropMask, traceOutline, type Region } from '../utils/outlineTrace';
import { scaleFromPart } from '../utils/photoScale';
import type { VisionMasks } from '../utils/photoMask';
import { referenceMask } from '../utils/silhouette';
import { bandWidths, maskBounds } from '../utils/silhouetteProfile';
import { modelExtent, modelMask } from './agentTargetRequest';

type Payload = Record<string, unknown>;

interface TraceContext {
  parts: () => ScenePart[];
  viewport: () => Viewport3DHandle | null;
}

const regionOf = (value: unknown): Region | undefined => {
  if (!Array.isArray(value) || value.length !== 4) return undefined;

  const [x0, y0, x1, y1] = value.map(Number);

  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : undefined;
};

async function modelBandsMm(view: string, ids: string[] | undefined, ctx: TraceContext, heightMm: number) {
  const mask = await modelMask(view, ids, ctx);
  const measured = mask ? bandWidths(mask) : null;

  if (!measured) return null;

  const mmPerPx = heightMm / (measured.box.y1 - measured.box.y0 + 1);

  return measured.widths.map((w) => Math.round(w * mmPerPx * 10) / 10);
}

function scaleOf(payload: Payload, extent: { lo: number; hi: number } | null) {
  const given = Number(payload.heightMm) || 0;

  if (given > 0) return { heightMm: given, z0: 0, scaledFrom: 'height' };

  return { heightMm: extent ? extent.hi - extent.lo : 0, z0: extent?.lo ?? 0, scaledFrom: 'model' };
}

const pointCount = (value: unknown) => Math.max(12, Math.min(32, Number(value) || 20));

export async function traceRequest(payload: Payload, ctx: TraceContext) {
  const view = String(payload.view ?? 'front');
  const ids = (payload.ids as string[] | undefined) ?? undefined;
  const region = regionOf(payload.region);
  const found = await referenceMask({
    dataUrl: String(payload.reference),
    masks: (payload.masks as VisionMasks | undefined) ?? null,
    allowCut: Boolean(region || ids?.length),
  });

  if (!found.mask) return { reason: found.reason };

  const mask = cropMask(found.mask, region);
  const box = maskBounds(mask);
  const extent = modelExtent(ctx.parts(), view, ids);
  const scale = scaleOf(payload, extent);

  if (box.x1 < 0) return { reason: 'the region holds none of the subject' };

  if (scale.heightMm <= 0) return { reason: 'give height_mm: there is no model to take the scale from' };

  const traced = traceOutline(mask, {
    mmPerPx: scale.heightMm / (box.y1 - box.y0 + 1),
    n: pointCount(payload.points),
    z0: scale.z0,
  });
  const model = extent ? await modelBandsMm(view, ids, ctx, extent.hi - extent.lo) : null;

  return { view, traced, model, source: found.source, notes: found.notes, scaledFrom: scale.scaledFrom };
}

export async function scaleRequest(payload: Payload) {
  const region = regionOf(payload.region);
  const sizeMm = Number(payload.sizeMm) || 0;

  if (!region || sizeMm <= 0) return { reason: 'give the region around the part and its real size_mm' };

  const found = await referenceMask({
    dataUrl: String(payload.reference),
    masks: (payload.masks as VisionMasks | undefined) ?? null,
    allowCut: true,
  });

  if (!found.mask) return { reason: found.reason };

  const axis = payload.axis === 'height' ? 'height' : 'width';
  const scale = scaleFromPart(found.mask, { region, axis, sizeMm });

  return scale ? { ...scale, axis, source: found.source, notes: found.notes } : { reason: 'the region is empty' };
}
