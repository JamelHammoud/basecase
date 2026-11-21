import { bodyClient, bodyAnalysisMetrics } from '../../../reality/bodyClient';
import { bodyMotionRenderMetrics } from '../../../reality/bodyMotionRenderer';
import { rememberBodyEvidence, type BodyEvidenceSnapshot } from '../../../reality/bodyEvidence';
import type { RobotRun } from '../../../robot/runBuffer';
import type { SimModel } from '../../../sim/mjcfTypes';
import { bodyRecordingContext, retainBodyRecording } from '../../../reality/bodyRecordingEvidence';
import { withBodyEvidence } from '../../../reality/bodyEvidence';
import { selectedUnit, robotSnapshot, robotSceneJoints, robotBenchDriving } from '../../../robot/robotStore';
import { bodySequenceSession } from '../../../reality/bodySequenceRecording';
import { keepSession } from '../../../cases/tryStore';
import type { StoredTry } from '../../../cases/tryFile';
import type { Studio } from '../types';

export default function bodyAnalysisStudio(studio: Studio) {
  return {
    bodyAnalysisMetrics: () => ({
      ...bodyAnalysisMetrics(),
      preview: bodyMotionRenderMetrics(),
      runtime: {
        unit: selectedUnit(),
        link: robotSnapshot().link,
        mode: robotSnapshot().mode,
        joints: robotSceneJoints(),
        bench: robotBenchDriving(),
        pose: studio().core.posing.pose,
      },
    }),
    seedBodyEvidence: async ({
      run,
      model,
      id,
      analyzed = false,
      recommended = false,
      generated = false,
    }: {
      run: RobotRun;
      model: SimModel;
      id: string;
      analyzed?: boolean;
      recommended?: boolean;
      generated?: boolean;
    }) => {
      const { core } = studio();
      const project = core.docs.projectRef.current;
      const unit = selectedUnit();
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
        source: generated ? 'generated' : 'operate',
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
      const session = bodySequenceSession(run);

      await keepSession(stored, session);

      const ref = await retainBodyRecording({ context, stored: { ...stored, source: 'operate' }, session, project });

      if (!ref) throw new Error('Body evidence missing');

      const snapshot: BodyEvidenceSnapshot = {
        ...context.snapshot,
        generated: generated ? true : undefined,
        sessionHash: ref.sessionHash,
        request: { ...context.snapshot.request, run, source: { ...context.snapshot.request.source, recording: id } },
      };

      if (analyzed || recommended) {
        const saved = await analyzeRetained(snapshot, recommended);

        core.docs.updateProjectNow((current) => withBodyEvidence(current, saved));

        return;
      }

      const saved = generated ? await rememberBodyEvidence(snapshot) : ref;

      core.docs.updateProjectNow((current) => withBodyEvidence(current, saved));
    },
    editBodyEvidenceSource: () =>
      studio().core.docs.commitParts((parts) =>
        parts.map((part, index) => (index === 0 ? { ...part, massG: (part.massG ?? 1) + 1 } : part)),
      ),
  };
}

async function analyzeRetained(snapshot: BodyEvidenceSnapshot, recommended = false) {
  const client = bodyClient();

  try {
    const result = await client.analyze(snapshot.request);

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const motion = recommended
      ? await client.recommend({ request: snapshot.request, result, selected: [0] })
      : undefined;

    if (recommended && motion?.kind !== 'recommended') throw new Error('Motion fixture could not be recommended');

    return await rememberBodyEvidence({ ...snapshot, result, motion });
  } finally {
    client.dispose();
  }
}
