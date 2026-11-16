import { restoreWorldAssets } from '../cases/worldAssets';
import { CaseCheckPool } from '../cases/caseChecksClient';
import { summarizeRuns, type SeedRuns } from '../cases/caseRuns';
import { supplyVolts } from '../cases/exploreDesigns';
import { bundleScene } from '../gallery/galleryBundle';
import { createStudySession } from '../study/client';
import type { StudyRow } from '../study/types';
import { classroomFileClient } from './fileClient';
import type { Assignment, Submission } from './envelope';

export const gradingResources = () => ({
  study: createStudySession(),
  cases: new CaseCheckPool(),
  files: classroomFileClient(),
});
export type GradingResources = ReturnType<typeof gradingResources>;

export async function prepareClassroom(resources: GradingResources, assignment: Assignment, submission: Submission) {
  const { bundle, design } = await resources.files.call('pin', { assignment, submission });

  await restoreWorldAssets(bundle.worldAssets);

  const source = bundleScene(bundle);
  const project = { ...source.project, ...design, budgetUsd: assignment.budgetUsd };
  const scene = await resources.study.refresh(
    { parts: source.parts, project, measures: {}, triangles: {} },
    source.parts.map((p) => p.id),
    100000,
  );
  const robot = {
    id: submission.fingerprint,
    parts: scene.parts,
    joints: project.joints ?? [],
    measures: scene.measures,
    triangles: scene.triangles,
    servoVolts: supplyVolts(scene.parts, project),
  };
  const model = await resources.cases.run(0, { type: 'model', robot, walks: [] });

  return { bundle, scene, robot, model };
}

export type PreparedClassroom = Awaited<ReturnType<typeof prepareClassroom>>;

export async function runClassroomSeeds(resources: GradingResources, prepared: PreparedClassroom, seeds: number[]) {
  const { bundle, robot, model } = prepared;
  const response = await resources.cases.run(
    0,
    { type: 'runs', kase: bundle.case, modelHash: model.modelHash, seeds, stop: model.stop, walk: null },
    { robot: () => robot },
  );

  return response.result;
}

export async function finishClassroom(
  resources: GradingResources,
  prepared: PreparedClassroom,
  submission: Submission,
  batches: SeedRuns[],
) {
  const runs = summarizeRuns(batches);
  const row = await resources.study.grade(prepared.scene, {
    knobs: [],
    selection: [],
    purchases: {},
    completeBudget: true,
    runs,
    kase: prepared.bundle.case,
  });

  if (![row.costUsd, row.massG].every((value) => Number.isFinite(value) && value >= 0))
    throw new Error('The robot’s cost and mass couldn’t be calculated.');

  return { ...row, key: submission.fingerprint, label: submission.name };
}

function dispose(resources: GradingResources | null) {
  resources?.study.dispose();
  resources?.cases.dispose();
  resources?.files.dispose();
}

export class ClassroomGrader {
  private active: GradingResources | null = null;
  private canceled = false;

  private readonly resources: typeof gradingResources;

  constructor(resources = gradingResources) {
    this.resources = resources;
  }

  private acquire() {
    if (this.canceled || this.active) throw new Error('Canceled');

    this.active = this.resources();

    return this.active;
  }

  async grade(assignment: Assignment, submission: Submission): Promise<StudyRow> {
    const resources = this.acquire();

    try {
      const prepared = await prepareClassroom(resources, assignment, submission);
      const batch = await runClassroomSeeds(resources, prepared, assignment.seeds);
      const row = await finishClassroom(resources, prepared, submission, [batch]);

      if (this.canceled) throw new Error('Canceled');

      return row;
    } finally {
      dispose(resources);
      this.active = null;
    }
  }

  async replay(assignment: Assignment, submission: Submission, seed: number) {
    const resources = this.acquire();

    try {
      const { bundle, robot, model } = await prepareClassroom(resources, assignment, submission);
      const response = await resources.cases.run(
        0,
        { type: 'record', kase: bundle.case, modelHash: model.modelHash, seed, walk: null },
        { robot: () => robot },
      );

      if (this.canceled) throw new Error('Canceled');

      return { bundle, replay: response.replay };
    } finally {
      dispose(resources);
      this.active = null;
    }
  }

  cancel() {
    this.canceled = true;
    dispose(this.active);
    this.active = null;
  }
}
