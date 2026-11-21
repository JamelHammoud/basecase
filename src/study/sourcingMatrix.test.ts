import { describe, expect, it } from 'vitest';
import { noRuns } from '../cases/caseRuns';
import { buildBom } from '../utils/bom';
import { runEngineering } from '../utils/engineering';
import { sourcingSnapshot, studyPurchasing } from './sourcing';
import {
  sourcingEvidence,
  sourcingMorphologies,
  sourcingKnob,
  SOURCING_REQUIREMENTS,
  SOURCING_TIME,
} from './sourcingFixtures';
import { gradeStudyReport, runStudy, studyFingerprint } from './study';
import { createStudyGrader } from './grade';
import type { StudyRecord } from './types';
import { readStudyRecord } from './record';
import { sceneJson } from '../utils/sceneJson';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';

const morphologies = sourcingMorphologies();

describe('Study purchasing across robot alternatives', () => {
  it.each(morphologies)(
    'compares $name at quantities one and twenty without mutating the baseline',
    async ({ scene }) => {
      const purchases = await sourcingEvidence(scene);
      const before = structuredClone(scene);
      const knobs = [sourcingKnob(scene)];
      const baseline = JSON.stringify(purchases);

      for (const quantity of [1, 20]) {
        const sourcing = sourcingSnapshot({ ...SOURCING_REQUIREMENTS, quantity }, purchases, SOURCING_TIME);
        const rows = await runStudy(
          { ...scene, sourcing },
          {
            knobs,
            purchases,
            runs: async () => ({ ...noRuns('controlled Case'), refusal: null, runs: 8, passes: 0 }),
            grade: async (candidate, options) => {
              const engineering = runEngineering({ ...candidate, purchases, servoOutputs: {} });

              return {
                ...gradeStudyReport(candidate, options, engineering),
                purchasing: studyPurchasing(
                  buildBom({ ...candidate, purchases, now: new Date(SOURCING_TIME) }),
                  sourcing,
                ),
              };
            },
          },
        );

        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.purchasing?.purchasingComplete)).toBe(true);
        expect(rows.every((row) => row.runs?.passes === 0)).toBe(true);
        expect(rows.every((row) => row.checks.some((check) => check.caseId && check.status !== 'pass'))).toBe(true);
        expect(rows[1].purchasing?.lines.some((item) => item.line.key.endsWith('|c018'))).toBe(true);
        expect(rows[0].purchasing?.lines.every((item) => item.line.qty >= quantity)).toBe(true);
      }

      expect(scene).toEqual(before);
      expect(JSON.stringify(purchases)).toBe(baseline);
    },
  );

  it('keeps sufficient purchasing evidence beside real failing Checks and deterministic portable history', async () => {
    const original = morphologies.find((item) => item.name === 'fixed arm')!.scene;
    const scene = {
      ...original,
      parts: original.parts.map((part) => (part.id === 'hand' ? { ...part, massG: 5000 } : part)),
    };
    const purchases = await sourcingEvidence(scene);
    const sourcing = sourcingSnapshot(SOURCING_REQUIREMENTS, purchases, SOURCING_TIME);
    const knobs = [sourcingKnob(scene)];
    const grader = createStudyGrader();

    try {
      const current = grader.grade({ ...scene, sourcing }, { knobs: [], selection: [], purchases });
      const rows = await runStudy(
        { ...scene, sourcing },
        { knobs, purchases, grade: async (candidate, options) => grader.grade(candidate, options) },
      );
      const study: StudyRecord = {
        sourcing,
        knobs,
        current,
        rows,
        total: rows.length,
        seed: 1,
        baseKey: studyFingerprint(scene.parts, scene.project),
        base: { parts: scene.parts, project: scene.project },
      };

      expect(rows.every((row) => row.purchasing?.purchasingComplete)).toBe(true);
      expect(rows.some((row) => row.checks.some((check) => check.status === 'fail'))).toBe(true);
      expect(rows[0].metrics.torque).toBe('fail');
      expect(readStudyRecord(study)).toEqual(study);

      const project = { ...scene.project, study };
      const autosaved = JSON.parse(await sceneJson({ parts: scene.parts, project }));
      const portable = await decodeSceneFile(
        await encodeSceneFile(sharedScene({ name: 'Sourcing arm', globalGoal: '', parts: scene.parts, project })),
      );

      expect(readStudyRecord(autosaved.project.study)).toEqual(study);
      expect(portable.project?.study).toEqual(study);
      purchases['component:feetech-sts3215|c001'].supplierOffers = { offers: [] };
      expect(readStudyRecord(portable.project?.study)).toEqual(study);
      expect(readStudyRecord({ ...study, sourcing: undefined })).toBeUndefined();
      expect(readStudyRecord({ ...study, sourcing: { ...sourcing, id: 'changed' } })).toBeUndefined();
    } finally {
      grader.dispose();
    }
  });
});
