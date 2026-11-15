import { useEffect, useRef, useState } from 'react';
import { createStudySession, type StudySession } from '../study/client';
import type { StudyRecord, StudyRow, StudyScene } from '../study/types';
import { replayStudy } from './studyRun';

interface StudyPreviewOptions {
  shown: StudyRecord | null;
  disabled: boolean;
  onError: (error: unknown) => void;
}

export function useStudyPreview({ shown, disabled, onError }: StudyPreviewOptions) {
  const [previewed, setPreviewed] = useState<{ key: string; scene: StudyScene } | null>(null);
  const previewId = useRef(0);
  const session = useRef<StudySession | null>(null);
  const clear = () => {
    previewId.current++;
    setPreviewed(null);
  };
  const dispose = () => {
    session.current?.dispose();
    session.current = null;
  };

  useEffect(
    () => () => {
      previewId.current++;
      session.current?.dispose();
    },
    [],
  );

  const replay = (record: StudyRecord, selection: number[]) => {
    session.current ??= createStudySession();

    return replayStudy(record, selection, session.current);
  };

  return {
    previewed,
    clear,
    replay,
    reset: () => {
      clear();
      dispose();
    },
    preview: (row: StudyRow | null) => {
      clear();

      if (!row || !shown || disabled || row.error) return;

      const turn = previewId.current;

      void replay(shown, row.selection)
        .then((scene) => {
          if (previewId.current === turn) setPreviewed({ key: row.key, scene });
        })
        .catch((error: unknown) => {
          if (previewId.current === turn) onError(error);
        });
    },
  };
}
