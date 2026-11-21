import { useEffect, useState } from 'react';
import { onTriesChanged, useTries } from '../cases/tryStore';
import type { Case } from '../cases/schema';
import { partCameras } from '../datasets/cameras';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { StudyVisibilityRequest } from '../study/visibilityPlan';

export function useStudyVisibility(input: {
  project: ProjectSettings;
  parts: ScenePart[];
  kase: Case | null;
  sceneId?: string;
}) {
  const listed = useTries();
  const tries = listed ?? [];
  const savedId = input.project.study?.visibility?.tryId;
  const [replaced, setReplaced] = useState(false);

  useEffect(
    () =>
      onTriesChanged((change) => {
        if (savedId && (change.deleted.includes(savedId) || change.kept.some((stored) => stored.id === savedId)))
          setReplaced(true);
      }),
    [savedId],
  );

  const [configured, setConfigured] = useState<StudyVisibilityRequest | null>(null);
  const chosen = configured ?? input.project.study?.visibility;
  const request = chosen?.tryId ? chosen : undefined;
  const recordings = tries.filter(
    (stored) =>
      (stored.source === 'case' || stored.source === 'generated') &&
      stored.caseId === input.kase?.id &&
      stored.sceneId === input.sceneId &&
      stored.recording,
  );
  const cameraIds = new Set(partCameras(input.parts).map((view) => view.part));
  const cameras = input.parts.filter((part) => cameraIds.has(part.id));
  const targets = input.kase?.world.objects ?? [];

  return {
    request,
    stale:
      replaced || (!!savedId && listed !== null && !tries.some((stored) => stored.id === savedId && stored.recording)),
    accept: () => setReplaced(false),
    recordings,
    cameras,
    targets,
    select: (tryId: string) =>
      setConfigured({
        tryId,
        cameras: cameras.map((part) => part.id).slice(0, 8),
        targets: targets.slice(0, 1).map((target) => ({ id: target.id, minPixels: 100 })),
        samples: 8,
      }),
    edit: (next: StudyVisibilityRequest) => setConfigured(next),
    clear: () => setConfigured({ tryId: '', cameras: [], targets: [], samples: 8 }),
    reset: () => {
      setConfigured(null);
      setReplaced(false);
    },
  };
}
