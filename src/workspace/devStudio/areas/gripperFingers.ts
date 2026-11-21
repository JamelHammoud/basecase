import type { Studio } from '../types';

export default function gripperFingersStudio(studio: Studio) {
  return {
    graspEvidence: () => {
      const timeline = studio().core.simTraining.cases.timeline;
      const scene = timeline.scene;

      return {
        target: scene?.kase.world.pickTarget ?? null,
        passed: timeline.record?.passed ?? null,
        gripFrames: scene?.trace.signals.grip?.filter(Boolean).length ?? 0,
        contactPairs: timeline.recording?.contacts?.length ?? 0,
      };
    },
  };
}
