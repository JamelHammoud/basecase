import { useState } from 'react';
import { Button, Select, confirmAction } from '../../design-system';
import { localBuilds } from '../../kit/buildRecords';
import { currentBuildRepair } from '../../kit/buildRepairState';
import { platformBridge } from '../../utils/platformBridge';
import type { WorkspaceCore } from '../../workspace/useWorkspaceCore';

export function BuildRepairProgress({ core, onChanged, onError }: {
  core: WorkspaceCore; onChanged: () => void; onError: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const frozen = core.buildAlong.frozen;

  if (!frozen) return null;

  const { record } = frozen;
  const repair = currentBuildRepair(record);
  const latest = record.repairs?.at(-1);
  const refresh = () => core.buildAlong.openFrozen(record.id);
  const finish = async () => {
    if (!repair || busy) return;

    setBusy(true);

    try {
      await localBuilds.stageRepair(record.id, repair.id);
      await localBuilds.finishRepair({ id: record.id, repair: repair.id, purchases: await platformBridge.listPurchases() });
      await refresh();
      onChanged();
    } catch (error) { onError(error); await refresh(); }
    finally { setBusy(false); }
  };

  return <div className="space-y-2" data-repair-source={latest?.source} data-repair-target={latest?.target}>
    {record.repairs?.length ? <Select aria-label="Build history" value={frozen.repair?.id ?? 'original'} options={[
      { value: 'original', label: 'Original assembly' },
      ...record.repairs.map((item) => ({ value: item.id, label: `${item.target.slice(0, 12)}, ${item.state}` })),
    ]} onChange={(event) => void core.buildAlong.openFrozen(record.id, event.target.value)} /> : null}
    {repair ? <div className="space-y-2">
      <div className="break-all text-[12px]">{repair.source} → {repair.target}</div>
      <Button fullWidth disabled={busy} onClick={() => void localBuilds.resumeRepair(record.id, repair.id).then(refresh).catch(onError)}>Resume Repair</Button>
      <Button fullWidth disabled={busy || Object.keys(repair.completed).length !== repair.count} onClick={() => void finish()}>Finish Repair</Button>
      <Button fullWidth disabled={busy} onClick={() => confirmAction({ title: 'Cancel repair?', confirmLabel: 'Cancel Repair', onConfirm: () => { void localBuilds.cancelRepair(record.id, repair.id).then(refresh).catch(onError); } })}>Cancel Repair</Button>
    </div> : <Button fullWidth onClick={core.buildAlong.requestRepair}>Repair Build</Button>}
  </div>;
}
