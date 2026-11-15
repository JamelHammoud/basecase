import type { ImageMask, TrainingFrame } from '../vision/frameSet';
import { makeMaskLabelGeometry } from '../vision/labelEditsClient';

export function maskFrameLabel(frame: TrainingFrame, mask: ImageMask, label: { instance: string; classId: number }) {
  return makeMaskLabelGeometry({
    width: frame.width,
    height: frame.height,
    mask,
    instance: label.instance,
    classId: label.classId,
    keypoints: frame.annotations.find((annotation) => annotation.instance === label.instance)?.keypoints,
  });
}
