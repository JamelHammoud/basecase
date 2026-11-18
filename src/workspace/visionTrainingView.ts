import { TRAINING_METRIC_LABELS, trainingScore } from '../vision/training/presentation';
import type { VisionAttemptView, VisionTrainingView } from '../components/tries/visionTrainingView';
import { cameraViews, stripParts } from '../cameras/views';
import { retainedVisionTargets } from '../vision/training/models';
import type { TrainingRun } from '../vision/training/serviceTypes';
import type { TrainingRetentionReason } from '../vision/training/types';
import { visionInspectionNavigation } from './visionInspectionNavigation';
import type { WorkspaceCore } from './useWorkspaceCore';

const REASONS: Record<TrainingRetentionReason, string> = {
  improved: 'Improved on the held-out real images',
  'no-real-test': 'Add held-out real images to compare models',
  'no-incumbent': 'Add an incumbent model to compare accuracy',
  'different-test': 'The models used different held-out images',
  'different-task': 'The models used different tasks',
  limits: 'The model exceeded the task limits',
  requirements: '',
  'no-improvement': 'The incumbent scored higher or tied',
};

export function visionAttemptView(run: TrainingRun): VisionAttemptView {
  const { report, comparison } = run;

  return {
    id: run.id,
    requirements: comparison.requirements,
    at: run.at,
    inspection:
      run.report.evidence && run.incumbentReport.evidence
        ? { candidate: run.report, incumbent: run.incumbentReport }
        : undefined,
    retained: run.status === 'retained',
    reason: REASONS[comparison.reason],
    metrics: [
      { name: TRAINING_METRIC_LABELS[report.task.metric], value: trainingScore(report.metrics.primary) },
      { name: 'Incumbent', value: trainingScore(comparison.incumbentScore ?? null) },
    ],
    failures: report.metrics.perClass.map((entry) => ({
      className: entry.name,
      missed: entry.falseNegative,
      falsePositives: entry.falsePositive,
    })),
    inferenceMs: report.metrics.inference.samples ? report.metrics.inference.p95Ms : null,
    bytes: report.metrics.inference.modelBytes,
  };
}

export function datasetVisionView(core: WorkspaceCore): VisionTrainingView {
  const training = core.datasets.vision;
  const cameras = cameraViews(stripParts(core.parts), core.simTraining.sim.worldParts, core.project.cameras);
  const retained = training.runs.findLast((run) => run.status === 'retained');
  const choices = cameras.map(({ key, label }) => ({ id: key, name: label }));
  const allTargets = retainedVisionTargets(core.scene.sceneId, choices);
  const targets = retainedVisionTargets(core.scene.sceneId, choices, {
    kind: retained?.kind,
    classes: retained?.manifest?.classes,
  });

  return {
    ...training,
    inspectionContext: `${core.workspaceId}:${core.scene.sceneId}:${core.active}`,
    attempts: training.runs.map((run) => ({
      ...visionAttemptView(run),
      navigation: visionInspectionNavigation(core, run),
      active: run.id === retained?.id,
      targets: retainedVisionTargets(core.scene.sceneId, choices, { kind: run.kind, classes: run.manifest.classes }),
    })),
    running: training.datasetId === core.triesView.dataset?.id,
    targets,
    apply: (runId, targetId) => {
      const run = training.runs.find((entry) => entry.id === runId);
      const target = allTargets.find((entry) => entry.id === targetId);

      if (run && target) training.apply(run, target.target);
    },
  };
}
