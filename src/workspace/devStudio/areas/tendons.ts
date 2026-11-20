import { loadRecording } from '../../../cases/tryStore';
import type { Studio } from '../types';

export default function tendonsStudio(studio: Studio) {
  return {
    tendonRecording: async (id: string) => {
      const recording = await loadRecording(id);

      return recording
        ? {
            nu: recording.nu,
            nq: recording.nq,
            transmission: recording.transmission,
            opened: studio().core.simTraining.cases.timeline.recording?.transmission,
          }
        : null;
    },
  };
}
