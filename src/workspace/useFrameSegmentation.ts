import { useEffect, useRef } from 'react';
import type { SegmentLabelRequest, TrackLabelRequest } from '../components/visionLabels/labelEditorTypes';
import type { ImageMask, TrainingFrame } from '../vision/frameSet';
import { putLabel } from '../vision/labelEdits';
import { labelMaskPoint } from '../vision/labelEditsClient';
import { createSegmentationRuntime } from '../vision/segmentationRuntime';
import { trackingFrames } from './frameLabelTracking';
import { maskFrameLabel } from './frameLabelGeometry';

type Runtime = ReturnType<typeof createSegmentationRuntime>;

const visibleMask = (mask: ImageMask) => mask.counts.some((count, index) => index % 2 === 1 && count > 0);

const bitmapOf = (frame: TrainingFrame) =>
  createImageBitmap(new Blob([Uint8Array.from(frame.jpeg)], { type: 'image/jpeg' }));

export function useFrameSegmentation() {
  const runtime = useRef<Runtime | null>(null);
  const points = useRef<{ key: string; values: Array<{ x: number; y: number; label: 1 }> }>({ key: '', values: [] });

  useEffect(
    () => () => {
      runtime.current?.close();
      runtime.current = null;
    },
    [],
  );

  const ready = async () => {
    runtime.current ??= createSegmentationRuntime();
    await runtime.current.load();

    return runtime.current;
  };

  const segment = async ({ frame, classId, instance, point }: SegmentLabelRequest) => {
    const session = await ready();
    const key = `${frame.id}:${instance ?? classId}`;
    const previous = points.current.key === key ? points.current.values : [];
    const values = [...previous, { x: point[0], y: point[1], label: 1 as const }];
    const labelId = instance ?? `label-${crypto.randomUUID()}`;

    const mask = await session.segment(await bitmapOf(frame), values);

    if (!visibleMask(mask)) return null;

    const annotation = await maskFrameLabel(frame, mask, { instance: labelId, classId });

    points.current = { key: `${frame.id}:${labelId}`, values };

    return annotation;
  };

  const track = async ({ set, frameId, instance }: TrackLabelRequest) => {
    const frames = trackingFrames(set.frames, frameId);
    const first = frames[0];
    const label = first.annotations.find((annotation) => annotation.instance === instance);

    if (!label) throw new Error('Choose a label to track.');

    const [x, y] = await labelMaskPoint(label.mask);
    const session = await ready();

    await session.reset();
    await session.segment(await bitmapOf(first), [{ x, y, label: 1 }]);

    let next = set;

    for (const frame of frames.slice(1)) {
      const mask = await session.next(await bitmapOf(frame));
      const existing = frame.annotations.find((annotation) => annotation.instance === instance);

      if (!visibleMask(mask) || (existing && (existing.source === 'manual' || existing.review === 'accepted')))
        continue;

      const annotation = await maskFrameLabel(frame, mask, label);

      next = putLabel(next, frame.id, { ...annotation, source: 'track', review: 'suggested' });
    }

    return next;
  };

  return { segment, track };
}
