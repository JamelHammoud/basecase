import { useRef, useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { frozenBuildSession, savedFrozenSession } from './frozenBuildSession';
import type { BuildRecord } from '../kit/buildRecords';
import { errorMessage } from '../utils/errorMessage';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ShowToast } from './types';
import { type Session } from './buildAlongSession';

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
  const openFrozen = async (id: string, history?: string) => {
    const run = ++openingRef.current;
    const camera = session?.camera ?? viewportRef.current?.currentView();

    if (!camera) return;

    setOpening(true);

    try {
      const next = await frozenBuildSession(id, camera, history);

      if (run === openingRef.current) setSession(next);
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

      setSession((current) => savedFrozenSession(current, record));
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  return { openFrozen, saveProgress, saving };
}
