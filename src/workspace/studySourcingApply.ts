import type { RefObject } from 'react';
import { studyFingerprint } from '../study/study';
import type { useStudyPreview } from './useStudyPreview';
import type { SceneCaseSource } from './useCaseCompare';
import type { SceneDocument } from './useSceneDocument';
import type { ShowToast } from './types';
import { loadStudyVisibility } from './studyVisibility';
import { createStudySession } from '../study/client';
import { prepareStudyMeshes } from '../study/meshFiles';
import type { StudyRecord, StudyRow, StudyScene } from '../study/types';
import { platformBridge } from '../utils/platformBridge';

export async function validateStudyPurchasing(record: StudyRecord, row: StudyRow, scene: StudyScene) {
  if (!record.sourcing) return true;

  if (!row.purchasing) return false;

  const purchases = await platformBridge.listPurchases();
  const session = createStudySession();

  try {
    const snapshot = await session.captureSourcing({
      requirements: record.sourcing.requirements,
      purchases,
      evaluatedAt: new Date().toISOString(),
    });
    const missing = scene.parts
      .filter(
        (part) =>
          part.visible && part.role === 'solid' && part.kind !== 'image_plane' && !scene.triangles[part.id]?.length,
      )
      .map((part) => part.id);
    const measured = missing.length
      ? await session.refresh(await prepareStudyMeshes(scene, record.knobs), missing)
      : scene;
    const current = await session.grade(
      { ...measured, sourcing: snapshot },
      { knobs: record.knobs, selection: row.selection, purchases: snapshot.purchases },
    );

    return (
      !!current.purchasing &&
      (await session.validatePurchasing({
        snapshot: record.sourcing,
        result: row.purchasing,
        purchases: await platformBridge.listPurchases(),
        now: new Date().toISOString(),
        current: current.purchasing,
      }))
    );
  } finally {
    session.dispose();
  }
}

async function validateStudySource(shown: StudyRecord, sceneId?: string): Promise<boolean> {
  if (!shown.visibility) return true;

  const session = await loadStudyVisibility({
    request: shown.visibility,
    base: { ...shown.base, measures: {}, triangles: {} },
    candidates: shown.total,
    sceneId,
    caseId: shown.caseId,
  });

  try {
    if (session.key !== shown.current.visibility?.key) throw new Error('Run Study again to apply a design.');

    return true;
  } finally {
    session.dispose();
  }
}

export function studyApplication({
  shown,
  stale,
  source,
  runId,
  foreground,
  previewing,
  showToast,
  reportError,
}: {
  shown: StudyRecord | null;
  stale: boolean;
  source: SceneCaseSource & { docs: Pick<SceneDocument, 'partsRef' | 'projectRef' | 'commitStudy'> };
  runId: RefObject<number>;
  foreground?: RefObject<boolean>;
  previewing: Pick<ReturnType<typeof useStudyPreview>, 'replay' | 'reset'>;
  showToast: ShowToast;
  reportError: (error: unknown) => void;
}) {
  const canApply = () => foreground?.current !== false;

  return async (row: StudyRow) => {
    if (!shown || stale || row.error || !canApply()) return;

    const turn = runId.current;
    const expected = studyFingerprint(source.docs.partsRef.current, source.docs.projectRef.current);
    const sourceValid = await validateStudySource(shown, source.sceneId).catch(reportError);

    if (!sourceValid) return;

    const next = await previewing.replay(shown, row.selection).catch(reportError);

    if (!next) return;

    const purchasingValid = await validateStudyPurchasing(shown, row, next).catch(reportError);

    if (!purchasingValid) {
      showToast('Run Study again to apply a design.', { tone: 'error' });

      return;
    }

    if (turn !== runId.current || !canApply() || source.docs.projectRef.current.study !== shown) return;

    if (expected !== studyFingerprint(source.docs.partsRef.current, source.docs.projectRef.current)) return;

    previewing.reset();
    source.docs.commitStudy(next.parts, next.project);
  };
}
