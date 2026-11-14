import { useRef, useState } from 'react';
import { armParts } from '../utils/armParts';
import { sizeArmInWorker } from '../utils/armSizingClient';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { armFailure, armTargetsOf, type ArmTarget } from './armTargets';
import { newId } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useArmSizing(core: WorkspaceCore) {
  const { docs, selection } = core;
  const [sheet, setSheet] = useState<ArmTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const targets = armTargetsOf(selection.selectedParts);

  const open = (from: ArmTarget[] = targets) => {
    if (!from.length) return;

    request.current += 1;
    setError(null);
    setSheet(from);
  };

  const close = () => {
    request.current += 1;
    setBusy(false);
    setSheet(null);
  };

  const size = async (payloadG: number) => {
    if (!sheet) return;

    const token = request.current;

    setBusy(true);

    const current = () => token === request.current;
    const result = await sizeArmInWorker({ targets: sheet.map((t) => t.at), payloadG }).finally(
      () => current() && setBusy(false),
    );

    if (!current()) return;

    if (!result.ok) {
      setError(armFailure(result, sheet, payloadG));

      return;
    }

    const placed = armParts(result.arm, { links: !IS_WEB_DEMO, prefix: newId('arm') });

    docs.commitParts((prev) => [...prev, ...placed.parts]);
    docs.updateProjectNow((p) => ({ ...p, skeleton: placed.skeleton }));
    setSheet(null);
    core.skeleton.setEditing(true);
    core.tool.setMode('pose');
    core.viewportRef.current?.frameAll();
  };

  return { targets, sheet, error, busy, open, close, size };
}

export type ArmSizingActions = ReturnType<typeof useArmSizing>;
