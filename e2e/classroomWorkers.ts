import type { Page } from 'playwright-core';
import type { CaseCheckJob } from '../src/cases/caseCheckJob';

function classroomPhysicsFixture() {
  self.onmessage = ({ data }: MessageEvent<{ id: number; job: CaseCheckJob }>) => {
    const { id, job } = data;

    if (job.type === 'model') {
      self.postMessage({
        id,
        reply: {
          type: 'model',
          modelHash: 'classroom-walkthrough',
          walk: null,
          stop: job.robot.joints.length ? null : 'This Case needs wheels.',
        },
      });

      return;
    }

    if (job.type !== 'runs') throw new Error('The persistence walkthrough only grades.');

    const result = job.stop
      ? { refusal: job.stop, misfit: true }
      : {
          outcomes: job.seeds.map((seed) => ({
            seed,
            passed: true,
            margin: 1,
            failed: [],
            path: new Float32Array(),
            firstTrip: null,
          })),
        };

    self.postMessage({ id, reply: { type: 'runs', result } });
  };
}

export const controlClassroomPhysics = (page: Page) =>
  page.context().route(/\/caseChecks\.worker[.-].*(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Cross-Origin-Embedder-Policy': 'credentialless' },
      body: `(${classroomPhysicsFixture.toString()})()`,
    }),
  );
