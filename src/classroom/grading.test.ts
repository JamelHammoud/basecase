import { hashOf } from '../skills/hash';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildClassroomWorkers, NodePipelineWorker, settleClassroomWorkers } from './nodeWorkers.fixtures';
import {
  ClassroomGrader,
  prepareClassroom,
  runClassroomSeeds,
  finishClassroom,
  type PreparedClassroom,
  type GradingResources,
} from './grading';
import { seedBatches, type SeedRuns } from '../cases/caseRuns';
import { classroomAssignments, generatedClassroom, pipelineResources } from './grading.fixtures';
import { classroomFixture } from './fixtures';
import { assignmentOf, classroomBytes, readAssignment, readSubmission, submissionOf } from './envelope';

beforeAll(async () => {
  await buildClassroomWorkers();
  vi.stubGlobal('Worker', NodePipelineWorker);
});
afterAll(() => vi.unstubAllGlobals());
afterEach(settleClassroomWorkers);

describe('classroom production grading pipeline', () => {
  describe.each(classroomAssignments.flatMap((item) => ['valid', 'failing'].map((mode) => ({ ...item, mode }))))(
    '$title with a $mode submission',
    ({ index, mode }) => {
      let input: Awaited<ReturnType<typeof generatedClassroom>>;
      let prepared: PreparedClassroom;
      let resources: GradingResources;
      const workers: NodePipelineWorker[] = [];
      const batches: SeedRuns[] = [];

      beforeAll(async () => {
        input = await generatedClassroom(index);
        resources = pipelineResources(workers);

        const teacher = await readAssignment(classroomBytes(input.assignment));
        const submission = mode === 'valid' ? input.valid : input.failing;

        prepared = await prepareClassroom(resources, teacher, await readSubmission(classroomBytes(submission)));
      });
      afterAll(async () => {
        resources?.study.dispose();
        resources?.cases.dispose();
        resources?.files.dispose();
        await settleClassroomWorkers();
        expect(workers.every((worker) => worker.terminated)).toBe(true);
      });
      it.each(seedBatches(20, 4).map((seeds) => ({ seeds })))(
        'evaluates prescribed seeds $seeds',
        async ({ seeds }) => {
          batches.push(await runClassroomSeeds(resources, prepared, seeds));
        },
      );
      it('independently grades all twenty seeds and engineering Checks', async () => {
        const submission = mode === 'valid' ? input.valid : input.failing;
        const row = await finishClassroom(resources, prepared, submission, batches);
        const jobs = workers.flatMap((worker) => worker.jobs).filter((job) => job.type === 'runs');

        expect(input.slots).toHaveLength(1);
        expect(row.massG).toBeGreaterThan(0);
        expect(jobs.flatMap((job) => job.seeds)).toEqual(input.assignment.seeds);
        expect(jobs.every((job) => job.walk === null && !job.policy)).toBe(true);

        if (mode === 'valid') {
          expect(row.runs?.runs).toBe(20);
          expect(row.runs?.passes).toBeGreaterThan(0);

          return;
        }

        expect(row.checks.some((check) => check.status === 'fail')).toBe(true);
        expect(row.runs?.passes).toBe(0);

        if (index === 7) expect(row.checks.find((check) => check.check === 'Servo torque')?.status).toBe('fail');

        if (index < 8) expect(row.runs?.runs).toBe(20);
        else {
          expect(row.runs?.runs).toBe(0);
          expect(row.runs?.refusal).toBeTruthy();
        }
      });
    },
  );

  describe('independent repeat grading', () => {
    let assignment: Awaited<ReturnType<typeof assignmentOf>>;
    let submission: Awaited<ReturnType<typeof submissionOf>>;
    let forged: typeof submission;
    const rows: Array<Awaited<ReturnType<ClassroomGrader['grade']>>> = [];

    beforeAll(async () => {
      const { bundle } = classroomFixture();

      assignment = await assignmentOf(bundle, 0.001);
      submission = await submissionOf(assignment, bundle, 'Same name');
      forged = structuredClone(submission);
      forged.bundle.case.reference.timeline = [];
      forged.fingerprint = hashOf({ ...forged, fingerprint: undefined });
    });
    it.each([0, 1, 2])('recomputes trial %i without trusting submitted evidence', async (trial) => {
      const grader = new ClassroomGrader(() => pipelineResources([]));
      const source = trial === 0 ? forged : submission;
      const claimed = { ...source, score: 100, ready: true, runs: { passes: 20 } };
      const row = await grader.grade(assignment, await readSubmission(classroomBytes(claimed)));

      rows.push(row);
      expect(row.checks.find((check) => check.check === 'Budget')?.status).toBe('fail');
      expect(row).not.toHaveProperty('ready');

      if (trial === 0) return;

      expect(row.checks).toEqual(rows[0].checks);
      expect(row.runs).toEqual(rows[0].runs);
      expect(row.costUsd).toBe(rows[0].costUsd);
      expect(row.massG).toBe(rows[0].massG);

      if (trial === 2) expect(rows[1]).toEqual(row);
    });
  });

  it('cancels active and queued work and refuses further grading', async () => {
    const { assignment, valid } = await generatedClassroom(1);
    const workers: NodePipelineWorker[] = [];
    const grader = new ClassroomGrader(() => pipelineResources(workers));
    const pending = grader.grade(assignment, valid);

    grader.cancel();
    await expect(pending).rejects.toThrow();
    await expect(grader.grade(assignment, valid)).rejects.toThrow('Canceled');
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });
});

it('keeps an incompatible robot unevaluated under the teacher task', async () => {
  const rover = await generatedClassroom(1);
  const arm = await generatedClassroom(4);
  const submission = await submissionOf(rover.assignment, arm.valid.bundle, 'Different robot');
  const grader = new ClassroomGrader(() => pipelineResources([]));
  const result = await grader.grade(rover.assignment, submission);

  expect(result.runs).toMatchObject({ runs: 0, passes: 0, misfit: true });
  expect(result.runs?.refusal).toContain('wheels');
});
