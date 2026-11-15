import { visionFrameSender, type VisionAssignment } from '../visionFrames';
import type { Picture } from './runners';

export function createOperatorVision(fail: (error: unknown) => void) {
  const sender = visionFrameSender(async () => {
    throw new Error('The camera frame is missing.');
  });
  let active = false;

  return {
    connect: sender.connect,
    configure: (assignments: VisionAssignment[]) => {
      const selected = assignments.filter((assignment) => assignment.camera === 'operator');

      active = selected.length > 0;
      sender.configure(selected);
    },
    wanted: () => active,
    take: (picture: Picture) => {
      if (!active) return;

      const timestamp = performance.now();
      const source = new VideoFrame(picture, { timestamp: Math.round(timestamp * 1000) });

      void sender
        .send('operator', timestamp, async () => source.clone())
        .catch(fail)
        .finally(() => source.close());
    },
    close: () => {
      active = false;
      sender.close();
    },
  };
}
