import { sourcingRequest } from './useStudy';
import type { StudyRequest } from './studyRun';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourcingEvidence, sourcingMorphologies, sourcingKnob, SOURCING_REQUIREMENTS } from '../study/sourcingFixtures';
import { sourcingSnapshot } from '../study/sourcing';
import { createStudyGrader } from '../study/grade';
import { studyFingerprint, studyScene } from '../study/study';
import type { StudyRecord } from '../study/types';
import { platformBridge } from '../utils/platformBridge';
import { studyApplication, validateStudyPurchasing } from './studySourcingApply';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';
import { studyRequest } from './agentStudyRequest';
import type { SceneCaseSource } from './useCaseCompare';

async function fixture(expires = false) {
  const scene = sourcingMorphologies().find((item) => item.name === 'fixed arm')!.scene;
  const now = new Date().toISOString();
  const purchases = await sourcingEvidence(scene, now);
  const requirements = { ...SOURCING_REQUIREMENTS, requiredBy: now.slice(0, 10) };

  for (const record of Object.values(purchases)) {
    const offer = record.supplierOffers!.offers[0].offer;

    if (expires) offer.expiresAt = new Date(Date.parse(now) + 3600000).toISOString();

    offer.arrivalEarliest = now.slice(0, 10);
    offer.arrivalLatest = now.slice(0, 10);
  }

  const sourcing = sourcingSnapshot(requirements, purchases, now);
  const knobs = [sourcingKnob(scene)];
  const next = await studyScene(scene, knobs, [1]);
  const grader = createStudyGrader();
  const current = grader.grade({ ...scene, sourcing }, { knobs: [], selection: [], purchases });
  const row = grader.grade({ ...next, sourcing }, { knobs, selection: [1], purchases });
  const study: StudyRecord = {
    sourcing,
    knobs,
    current,
    rows: [row],
    total: 2,
    seed: 1,
    baseKey: studyFingerprint(scene.parts, scene.project),
    base: { parts: scene.parts, project: scene.project },
  };

  grader.dispose();
  vi.spyOn(platformBridge, 'listPurchases').mockImplementation(async () => purchases);

  return { scene, purchases, next, study, row };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('runs agent requests without purchasing requirements after a sourced comparison while retaining panel drafts', async () => {
  const { study } = await fixture();
  const run = vi.fn<(request?: StudyRequest) => Promise<StudyRecord>>().mockResolvedValue(study);
  const context = { cases: { cases: [], active: null }, study: { run }, setAction: vi.fn() };
  const configured = study.sourcing!.requirements;

  await studyRequest({ knobs: study.knobs }, context);

  const request = run.mock.calls[0][0]!;

  expect(sourcingRequest(request, configured)).toBeUndefined();
  expect(sourcingRequest({}, configured)).toEqual(configured);
  expect(sourcingRequest({ sourcing: configured }, null)).toEqual(configured);
});

describe('Study sourcing through workspace production paths', () => {
  it('retains equivalent requirements and evidence in study_design inputs and both result formats', async () => {
    const { study, row } = await fixture();
    const run = vi.fn<(request?: StudyRequest) => Promise<StudyRecord>>().mockResolvedValue(study);
    const context = { cases: { cases: [], active: null }, study: { run }, setAction: vi.fn() };
    const reply = await studyRequest({ knobs: study.knobs, sourcing: SOURCING_REQUIREMENTS }, context);

    expect(run.mock.calls[0][0]).toMatchObject({ sourcing: SOURCING_REQUIREMENTS });
    expect(reply).toMatchObject({
      ok: true,
      sourcing: {
        id: study.sourcing!.id,
        requirements: study.sourcing!.requirements,
        evaluatedAt: study.sourcing!.evaluatedAt,
      },
      rows: [expect.objectContaining({ key: row.key, purchasing: row.purchasing, checks: row.checks })],
      designs: expect.arrayContaining([expect.objectContaining({ purchasing: row.purchasing })]),
    });
    expect(reply).not.toHaveProperty('sourcing.purchases');
    expect(await studyRequest({ sourcing: { ...SOURCING_REQUIREMENTS, quantity: 0 } }, context)).toMatchObject({
      ok: false,
    });
  });

  it('revalidates current evidence and rejects expiry or edits without altering saved results', async () => {
    const { study, row, next, purchases } = await fixture();
    const before = structuredClone(study);

    expect(await validateStudyPurchasing(study, row, next)).toBe(true);
    purchases['component:feetech-sts3215|c018'].supplierOffers!.offers[0].offer.expiresAt = '2020-01-01T00:00:00Z';
    expect(await validateStudyPurchasing(study, row, next)).toBe(false);
    expect(study).toEqual(before);
  });

  it('refuses unchanged evidence that expires after evaluation', async () => {
    const { study, row, next } = await fixture(true);

    expect(await validateStudyPurchasing(study, row, next)).toBe(true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(study.sourcing!.evaluatedAt) + 7200000);
    expect(await validateStudyPurchasing(study, row, next)).toBe(false);
  });

  it('applies the complete design in one history entry without buying or allocating stock', async () => {
    const { scene, purchases, study, row, next } = await fixture();
    let project = { ...scene.project, study };
    let doc = docFromParts(scene.parts);
    const before = structuredClone(purchases);
    const source = {
      workspaceId: 'sourcing',
      sceneName: 'Arm',
      viewportRef: { current: null },
      docs: {
        partsRef: { current: scene.parts },
        projectRef: { current: project },
        commitStudy: (parts: typeof scene.parts, chosen: typeof scene.project) => {
          doc = pushHistory(doc, parts, { ...trackedOf(project), tether: project.tether });
          project = { ...project, joints: chosen.joints, tether: chosen.tether };
        },
      },
    };
    const apply = studyApplication({
      shown: study,
      stale: false,
      source,
      runId: { current: 1 },
      previewing: { replay: async () => next, reset: vi.fn() },
      showToast: vi.fn(),
      reportError: vi.fn(),
    });

    await apply(row);
    expect(doc.parts).toEqual(next.parts);
    expect(doc.past).toHaveLength(1);

    const undone = travelProject(doc, project, { direction: 'undo' })!;
    const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;

    expect(undone.doc.parts).toEqual(scene.parts);
    expect(redone.doc.parts).toEqual(next.parts);
    expect(redone.project.study).toEqual(study);
    expect(purchases).toEqual(before);
  });

  it.each(['cancel', 'source edit', 'scene switch', 'background'] as const)(
    'refuses application after %s during replay',
    async (change) => {
      const { scene, study, row, next } = await fixture();
      const runId = { current: 1 };
      const foreground = { current: true };
      const commitStudy = vi.fn();
      const source: SceneCaseSource & { docs: SceneCaseSource['docs'] & { commitStudy: typeof commitStudy } } = {
        workspaceId: 'sourcing',
        sceneName: 'Arm',
        viewportRef: { current: null },
        docs: { partsRef: { current: scene.parts }, projectRef: { current: { ...scene.project, study } }, commitStudy },
      };
      const replay = async () => {
        const changes = {
          background: () => {
            foreground.current = false;
          },
          cancel: () => {
            runId.current++;
          },
          'source edit': () => {
            source.docs.partsRef.current = scene.parts.map((part) => ({ ...part, massG: 999 }));
          },
          'scene switch': () => {
            source.docs.projectRef.current = { ...scene.project };
          },
        };

        changes[change]();

        return next;
      };

      await studyApplication({
        shown: study,
        stale: false,
        source,
        runId,
        foreground,
        previewing: { replay, reset: vi.fn() },
        showToast: vi.fn(),
        reportError: vi.fn(),
      })(row);
      expect(commitStudy).not.toHaveBeenCalled();
    },
  );
});
