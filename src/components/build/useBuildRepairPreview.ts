import { useEffect, useRef, useState } from 'react';
import { buildRepairPreview } from '../../workspace/buildRepairPreview';
import { localBuilds } from '../../kit/buildRecords';
import type { WorkspaceCore } from '../../workspace/useWorkspaceCore';
import { useLatestRef } from '../../utils/useLatestRef';
import { errorMessage } from '../../utils/errorMessage';

export function useBuildRepairPreview(core: WorkspaceCore, onChanged: () => void) {
  const [choice, setChoice] = useState('current');
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof buildRepairPreview>> | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const latest = useLatestRef(core);
  const selected = useLatestRef(choice);
  const fail = (error: unknown) => core.showToast(errorMessage(error), { tone: 'error' });

  useEffect(() => () => abort.current?.abort(), []);

  const close = () => { abort.current?.abort(); core.buildAlong.closeRepair(); setPreview(null); };
  const choose = (value: string) => { setChoice(value); setPreview(null); };
  const compare = async () => {
    if (abort.current) return;

    const controller = new AbortController();

    abort.current = controller;
    setBusy(true);

    try {
      const result = await buildRepairPreview(core, { target: choice, signal: controller.signal, current: () => latest.current, selected: () => selected.current });

      setPreview(result);
    } catch (error) { if (!controller.signal.aborted) fail(error); }
    finally { abort.current = null; setBusy(false); }
  };
  const start = async () => {
    if (!preview || abort.current || !core.buildAlong.frozen) return;

    const controller = new AbortController();
    const id = core.buildAlong.frozen.record.id;

    abort.current = controller;
    setBusy(true);

    try {
      preview.guard();
      await localBuilds.startRepair({ id, target: preview.target, request: crypto.randomUUID(), signal: controller.signal, guard: preview.guard });
      close();
      await core.buildAlong.openFrozen(id);
      onChanged();
    } catch (error) { if (!controller.signal.aborted) fail(error); }
    finally { abort.current = null; setBusy(false); }
  };

  return { choice, choose, preview, busy, close, compare, start, fail };
}
