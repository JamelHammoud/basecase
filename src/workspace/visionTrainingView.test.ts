import { describe, expect, it, vi } from 'vitest';
import { visionTrainingRun } from '../../e2e/visionTrainingFixture';
import { datasetVisionView, visionAttemptView } from './visionTrainingView';
import type { WorkspaceCore } from './useWorkspaceCore';

describe('retained model destinations', () => {
  it('distinguishes missing inference measurements from a measured zero', () => {
    const run = visionTrainingRun();

    run.report.metrics.inference.p95Ms = 0;
    expect(visionAttemptView(run).inferenceMs).toBe(0);
    run.report.metrics.inference.samples = 0;
    expect(visionAttemptView(run).inferenceMs).toBeNull();
  });

  it('keeps the person destinations of an older model after retaining a different task', () => {
    const person = visionTrainingRun();
    const segment = visionTrainingRun();
    const apply = vi.fn();

    person.manifest.classes = ['person'];
    segment.id = 'segment-cups';
    segment.kind = 'segment';

    const core = {
      datasets: { vision: { runs: [person, segment], apply } },
      parts: [],
      simTraining: { sim: { worldParts: [] } },
      project: {},
      scene: { sceneId: 'scene' },
      triesView: { dataset: { id: 'dataset' } },
    } as unknown as WorkspaceCore;
    const view = datasetVisionView(core);

    expect(view.attempts[0].targets?.map((target) => target.id)).toEqual([
      'scene:object-detection',
      'scene:person-detection',
    ]);
    expect(view.attempts[1].targets?.map((target) => target.id)).toEqual(['scene:object-detection']);
    expect(view.targets.map((target) => target.id)).toEqual(['scene:object-detection']);
    view.apply(person.id, 'scene:person-detection');
    expect(apply).toHaveBeenCalledWith(person, { scene: 'scene', camera: 'scene', node: 'person-detection' });
  });
});
