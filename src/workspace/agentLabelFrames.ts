import { bytesToBase64 } from '../utils/base64';
import { errorMessage } from '../utils/errorMessage';
import { validateFrameSetHeader, type FrameSet, type ImageAnnotation } from '../vision/frameSet';
import { loadFrameJpeg, loadFrameSetManifest } from '../vision/frameSetStore';
import type { FrameSetManifest } from '../vision/frameSetStoreTypes';
import { makeLabelGeometry } from '../vision/labelEditsClient';
import { editLabelFrames } from './frameLabelStorage';
import { labelFramesInput, type LabelFramesInput } from './agentLabelFramesInput';

interface LabelContext {
  setAction: (action: string) => void;
}

interface LabelReply {
  ok: boolean;
  problem?: string;
  text?: string;
  frame_set?: string;
  updated?: number;
  frames?: Array<{ id: string; width: number; height: number }>;
  images?: Array<{ view: string; dataUrl: string }>;
}

function notifyLabels(id: string) {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('frame-set-labels-updated', { detail: { id } }));
}

async function updateLabels(original: FrameSet, input: LabelFramesInput): Promise<FrameSet> {
  const set = { ...original, classes: input.classes ?? original.classes, frames: [...original.frames] };

  validateFrameSetHeader(set);

  if (input.frames?.some((id) => !set.frames.some((frame) => frame.id === id)))
    throw new Error('Choose a frame in the dataset.');

  for (const update of input.labels ?? []) {
    const index = set.frames.findIndex((frame) => frame.id === update.frame);
    const frame = set.frames[index];

    if (!frame) throw new Error('Choose a frame in the dataset.');

    const annotations: ImageAnnotation[] = [];

    for (const label of update.annotations) {
      if (!set.classes.some((category) => category.id === label.classId))
        throw new Error('Choose a class in the dataset.');

      const annotation = label.mask
        ? (label as ImageAnnotation)
        : await makeLabelGeometry({ ...label, width: frame.width, height: frame.height });

      annotations.push({ ...annotation, source: 'agent', review: 'suggested' });
    }

    set.frames[index] = { ...frame, annotations };
  }

  return set;
}

async function frameReply(set: FrameSetManifest, input: LabelFramesInput): Promise<LabelReply> {
  const ids =
    input.frames ?? input.labels?.map((label) => label.frame) ?? set.frames.slice(0, 8).map((frame) => frame.id);
  const frames = ids.map((id) => set.frames.find((frame) => frame.id === id));

  if (frames.some((frame) => !frame)) throw new Error('Choose a frame in the dataset.');

  const selected = frames.filter((frame) => frame !== undefined);
  const images: NonNullable<LabelReply['images']> = [];

  let imageBytes = 0;

  for (const frame of selected) {
    const jpeg = await loadFrameJpeg(set.id, frame.id);

    if (!jpeg) throw new Error('The dataset is missing an image.');

    imageBytes += jpeg.length;

    if (imageBytes > 16 * 1024 * 1024) throw new Error('Choose fewer frames to keep the images under 16 MB.');

    images.push({
      view: `${frame.id} (${frame.width} × ${frame.height})`,
      dataUrl: `data:image/jpeg;base64,${bytesToBase64(jpeg)}`,
    });
  }

  const details = {
    ok: true,
    frame_set: set.id,
    frame_ids: set.frames.map((frame) => frame.id),
    classes: set.classes,
    frames: selected.map((frame) => ({
      id: frame.id,
      camera: frame.camera,
      width: frame.width,
      height: frame.height,
      annotations: frame.annotations.map(({ mask: _mask, ...annotation }) => annotation),
    })),
    updated: input.labels?.length ?? 0,
  };

  return { ...details, text: JSON.stringify(details), images };
}

async function labelFrames(payload: Record<string, unknown>, ctx: LabelContext): Promise<LabelReply> {
  try {
    const input = labelFramesInput(payload);

    ctx.setAction('Labeling frames');

    if (input.labels || input.classes) {
      const reply = await editLabelFrames(input.frameSet, async (original) => {
        const set = await updateLabels(original, input);
        const result = await frameReply(set, input);

        return { set, result };
      });

      notifyLabels(input.frameSet);

      return reply;
    }

    const set = await loadFrameSetManifest(input.frameSet);

    if (!set) throw new Error('Choose a saved image dataset.');

    return await frameReply(set, input);
  } catch (error) {
    const result = { ok: false, problem: errorMessage(error) };

    return { ...result, text: JSON.stringify(result) };
  }
}

export const LABEL_FRAME_HANDLERS = { label_frames: labelFrames };
