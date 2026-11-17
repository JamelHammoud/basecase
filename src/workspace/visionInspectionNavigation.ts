import { loadManifests, loadRecordingBytes } from '../cases/tryStore';
import { summaryOf, summaryRecord } from '../cases/tryFile';
import { evaluationWorker } from '../vision/training/evaluationWorker';
import type { TrainingRun } from '../vision/training/serviceTypes';
import type { ImageClass, TrainingFrame } from '../vision/frameSet';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { FrozenImageSample } from '../datasets/snapshotImages';

export interface InspectionNavigation {
  original: (sample: FrozenImageSample, current: () => boolean, classes?: ImageClass[]) => Promise<void>;
  source: (frame: TrainingFrame, current: () => boolean) => Promise<void>;
}

export function visionInspectionNavigation(core: WorkspaceCore, run: TrainingRun): InspectionNavigation {
  return {
    original: async (sample, current, classes) => {
      await core.frameLabels.open(sample.frameSetId, sample.frameId, { hash: sample.hash, current, classes });
    },
    source: async (frame, current) => {
      const origin = frame.origin;
      const provenance = run.provenance.find((entry) => entry.source === `try:${origin?.tryId}`);
      const historical = provenance?.manifests[0];

      if (!origin || !historical || !provenance?.inspection) throw new Error('Source try is unavailable');

      const [stored] = await loadManifests([origin.tryId]);
      const bytes = stored && (await loadRecordingBytes(origin.tryId));

      if (!stored || !bytes || JSON.stringify(stored) !== JSON.stringify(historical))
        throw new Error('Source try is unavailable');

      const recording = await evaluationWorker.call(
        'sourceRecording',
        { bytes, stored, expected: provenance.inspection, origin },
        [bytes.buffer],
      );

      if (!current()) return;

      const record = summaryRecord(summaryOf(stored, { recording: true, strip: false }));
      const shown = await core.simTraining.cases.timeline.show(record, origin.frame, undefined, {
        current,
        recording,
        stored,
      });

      if (!shown && current()) throw new Error('Source try is unavailable');
    },
  };
}
