import { useRef, useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { localBuilds, type BuildRecord } from '../kit/buildRecords';
import { frozenViewParts } from '../kit/frozenView';
import { buildAlongSteps } from '../guide/buildAlong';
import { errorMessage } from '../utils/errorMessage';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ShowToast } from './types';
import { stepView, type Session } from './buildAlongSession';

interface FrozenOptions {
  session: Session | null;
  setSession: Dispatch<SetStateAction<Session | null>>;
  openingRef: RefObject<number>;
  setOpening: Dispatch<SetStateAction<boolean>>;
  viewportRef: RefObject<Viewport3DHandle | null>;
  showToast: ShowToast;
}

export function useFrozenBuildAlong({
  session,
  setSession,
  openingRef,
  setOpening,
  viewportRef,
  showToast,
}: FrozenOptions) {
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
  const openFrozen = async (id: string) => {
    const run = ++openingRef.current;
    const camera = session?.camera ?? viewportRef.current?.currentView();

    if (!camera) return;

    setOpening(true);

    try {
      const frozen = await localBuilds.open(id);

      if (run !== openingRef.current) return;

      const { kit, record } = frozen;
      const nets = kit.manifest.wiring;
      const steps = buildAlongSteps(kit.manifest.guide, kit.project.joints ?? [], [
        ...(nets?.buses.flatMap((bus) => bus.nets) ?? []),
        ...(nets?.power.nets ?? []),
      ]);

      setSession({
        steps,
        views: steps.map(stepView),
        stepParts: kit.manifest.guide.steps.map((step) => step.partIds),
        index: record.index,
        camera,
        frozen: { ...frozen, parts: frozenViewParts(kit) },
      });
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    } finally {
      if (run === openingRef.current) setOpening(false);
    }
  };
  const saveProgress = async (change: (record: BuildRecord) => Promise<BuildRecord>) => {
    if (!session?.frozen || writing.current) return;

    const run = openingRef.current;

    writing.current = true;
    setSaving(true);

    try {
      const record = await change(session.frozen.record);

      if (run !== openingRef.current) return;

      setSession((current) =>
        current?.frozen
          ? {
              ...current,
              index: record.index,
              frozen: { ...current.frozen, record },
            }
          : current,
      );
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  return { openFrozen, saveProgress, saving };
}
