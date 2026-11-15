import type { TrainingFrame } from '../vision/frameSet';

export function trackingFrames(frames: TrainingFrame[], frameId: string): TrainingFrame[] {
  const first = frames.find((frame) => frame.id === frameId);

  if (!first?.origin) throw new Error('Track labels in frames extracted from a try.');

  return frames
    .filter(
      (frame) =>
        frame.camera === first.camera &&
        frame.origin?.tryId === first.origin?.tryId &&
        frame.origin!.frame >= first.origin!.frame,
    )
    .sort((a, b) => a.origin!.frame - b.origin!.frame)
    .slice(0, 31);
}
