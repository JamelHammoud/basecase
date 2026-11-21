import { bodyClient, bodyAnalysisMetrics } from '../../../reality/bodyClient';
import { rememberBodyEvidence, type BodyEvidenceSnapshot } from '../../../reality/bodyEvidence';
import type { RobotRun } from '../../../robot/runBuffer';
import { bodyRecordingContext, retainBodyRecording } from '../../../reality/bodyRecordingEvidence';
import { withBodyEvidence } from '../../../reality/bodyEvidence';
import { selectedUnit } from '../../../robot/robotStore';
import { unitHistories } from '../../../reality/projectCalibrations';
import { keepSession } from '../../../cases/tryStore';
import type { StoredTry } from '../../../cases/tryFile';
import type { Studio } from '../types';

export default function bodyAnalysisStudio(studio: Studio) {
  return {
    bodyAnalysisMetrics,
    seedBodyEvidence: async ({ run, id, analyzed = false }: { run: RobotRun; id: string; analyzed?: boolean }) => {
      const { core } = studio();
      const project = core.docs.projectRef.current;
      const unit = selectedUnit();
      const model = await core.simTraining.sim.buildModel({
        withoutBody: true,
        calibrations: unitHistories(project, unit),
      });
      const context = await bodyRecordingContext({
        model,
        project,
        parts: core.docs.partsRef.current,
        unit,
        scene: core.scene.sceneId,
        joints: run.joints,
      });

      if (!context) throw new Error('Body context missing');

      const stored: StoredTry = {
        version: 1,
        id,
        sceneId: core.scene.sceneId,
        robot: { name: model.robots[0].name, modelHash: context.modelHash, joints: run.joints },
        case: null,
        source: 'operate',
        input: null,
        startedAt: new Date().toISOString(),
        seconds: run.statuses.at(-1)!.at / 1000,
        rate: 20,
        frames: run.statuses.length,
        outcome: { verdict: 'unjudged', margin: null },
        seed: 0,
        sourceTry: null,
        faults: [],
      };
      const session =
        [
          ...run.statuses.map((sample) => ({ t: sample.at / 1000, k: 'status', q: sample.positions })),
          ...run.intents.map((sample) => ({ t: sample.at / 1000, k: 'intent', q: sample.joints })),
        ]
          .sort((a, b) => a.t - b.t)
          .map((sample) => JSON.stringify(sample))
          .join('\n') + '\n';

      await keepSession(stored, session);

      const ref = await retainBodyRecording({ context, stored, session, project });

      if (!ref) throw new Error('Body evidence missing');

      if (analyzed) {
        const saved = await analyzeRetained({
          ...context.snapshot,
          sessionHash: ref.sessionHash,
          request: { ...context.snapshot.request, run, source: { ...context.snapshot.request.source, recording: id } },
        });

        core.docs.updateProjectNow((current) => withBodyEvidence(current, saved));

        return;
      }

      core.docs.updateProjectNow((current) => withBodyEvidence(current, ref));
    },
    editBodyEvidenceSource: () =>
      studio().core.docs.commitParts((parts) =>
        parts.map((part, index) => (index === 0 ? { ...part, massG: (part.massG ?? 1) + 1 } : part)),
      ),
  };
}

async function analyzeRetained(snapshot: BodyEvidenceSnapshot) {
  const client = bodyClient();

  try {
    const result = await client.analyze(snapshot.request);

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    return await rememberBodyEvidence({ ...snapshot, result });
  } finally {
    client.dispose();
  }
}
