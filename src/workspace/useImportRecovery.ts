import { findPartDeep } from '../booleans/parts';
import { useEffect, useRef, type RefObject } from 'react';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { useLatestRef } from '../utils/useLatestRef';
import { recoverImportAsync } from '../utils/sketch/recoveryWorker';
import { validateRecoveryEntry } from '../utils/sketch/recoverySource';
import { validateRecoveryReferences } from './importRecoveryReferences';
import type { CommitParts, ShowToast } from './types';

interface ImportRecoveryOptions {
  activeWorkspace: boolean;
  parts: ScenePart[];
  project: ProjectSettings;
  partsRef: RefObject<ScenePart[]>;
  projectRef: RefObject<ProjectSettings>;
  commitParts: CommitParts;
  showToast: ShowToast;
  dismissToast: () => void;
  captureVersion: (label: string) => Promise<unknown>;
}

export function useImportRecovery({
  activeWorkspace,
  parts,
  project,
  partsRef,
  projectRef,
  commitParts,
  showToast,
  dismissToast,
  captureVersion,
}: ImportRecoveryOptions) {
  const active = useRef<AbortController | null>(null);
  const workspace = useLatestRef(activeWorkspace);

  useEffect(() => () => active.current?.abort(), [activeWorkspace, parts, project]);

  const convert = async (id: string) => {
    if (!workspace.current) return;

    active.current?.abort();

    const before = partsRef.current;
    const project = projectRef.current;
    const part = findPartDeep(before, id);

    if (!part) return;

    const abort = new AbortController();

    active.current = abort;

    const current = () =>
      workspace.current && !abort.signal.aborted && partsRef.current === before && projectRef.current === project;
    const discard = () => {
      if (active.current === abort) dismissToast();
    };

    try {
      validateRecoveryEntry(part);
      validateRecoveryReferences(before, part, project);
      showToast('Converting to Sketch…', {
        tone: 'progress',
        action: {
          label: 'Cancel',
          onClick: () => {
            abort.abort();
            dismissToast();
          },
        },
      });

      const result = await recoverImportAsync(part, abort.signal);

      if (!current()) {
        discard();

        return;
      }

      await captureVersion(part.name);

      if (!current()) {
        discard();

        return;
      }

      commitParts((parts) => parts.map((p) => (p === part ? result.part : p)));
      showToast(`${part.name}: ${result.measurement.deviationMm.toFixed(4)} mm deviation`);
    } catch (error) {
      if (active.current !== abort) return;

      if (abort.signal.aborted) dismissToast();
      else showToast(errorMessage(error), { tone: 'error' });
    } finally {
      if (active.current === abort) active.current = null;
    }
  };

  return { convert };
}
