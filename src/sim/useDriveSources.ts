import { useCallback, useRef } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { pointOfFor } from '../agent/agentPoseShared';
import type { Rig } from '../utils/kinematics';
import type { DriveAccess } from './driveAccess';
import { closeInputs, openInputs } from './inputSources';
import type { SimStart } from './useSimulation';

type Ready = Extract<DriveAccess, { kind: 'ready' | 'policy' }>;

interface SourceInputs {
  rig: Rig;
  startSim: (options?: SimStart) => Promise<void>;
}

export interface DriveSources {
  pin: (access: Ready) => Promise<void>;
  open: (access: Ready, ids: readonly string[]) => Promise<boolean>;
  close: (ids: readonly string[]) => void;
  forget: (ids: readonly string[]) => void;
}

export function useDriveSources(
  latest: React.RefObject<SourceInputs>,
  viewportRef: React.RefObject<Viewport3DHandle | null>,
  changed: () => void,
): DriveSources {
  const pinned = useRef<string | null>(null);

  const pin = useCallback(
    async (access: Ready) => {
      const want = (access.kind === 'ready' && access.pin) || null;

      if (want === pinned.current) return;

      pinned.current = want;
      await latest.current.startSim(want ? { pin: want } : {});
    },
    [latest],
  );

  const open = useCallback(
    async (access: Ready, ids: readonly string[]) => {
      const { rig } = latest.current;

      try {
        await openInputs(ids, {
          cls: access.cls,
          setup: access.kind === 'ready' ? access.setup : undefined,
          rig,
          pointOf: pointOfFor(rig, viewportRef.current),
          changed,
        });

        return true;
      } catch {
        return false;
      }
    },
    [latest, viewportRef, changed],
  );

  const close = useCallback((ids: readonly string[]) => closeInputs(ids), []);

  const forget = useCallback((ids: readonly string[]) => {
    closeInputs(ids);
    pinned.current = null;
  }, []);

  return { pin, open, close, forget };
}
