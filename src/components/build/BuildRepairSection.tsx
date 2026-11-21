import { Button, Modal, Select, Section } from '../../design-system';
import type { BuildSummary } from '../../kit/buildRecords';
import type { WorkspaceCore } from '../../workspace/useWorkspaceCore';
import { BuildRepairChanges } from './BuildRepairChanges';
import { BuildRepairProgress } from './BuildRepairProgress';
import { useBuildRepairPreview } from './useBuildRepairPreview';
import { repairRefusalText } from '../../kit/buildRepairRefusal';

export function BuildRepairSection({ core, records, onChanged }: { core: WorkspaceCore; records: BuildSummary[]; onChanged: () => void }) {
  const dialog = useBuildRepairPreview(core, onChanged);
  const record = core.buildAlong.frozen?.record;
  const { preview, busy } = dialog;

  if (!record) return null;

  const targets = [...new Map(records.map((item) => [item.configuration ?? item.kit, item])).values()];

  return <Section title="Repair" className="!px-0 !border-b-0">
    <BuildRepairProgress core={core} onChanged={onChanged} onError={dialog.fail} />
    <Modal isOpen={core.buildAlong.repairing} onClose={dialog.close} title="Repair Build" action={{ label: preview ? 'Start Repair' : 'Compare', disabled: busy || !!preview?.plan.refusal, onClick: () => void (preview ? dialog.start() : dialog.compare()) }}>
      <div className="space-y-3">
        <Select aria-label="Target revision" value={dialog.choice} disabled={busy} options={[
          { value: 'current', label: 'Current design' },
          ...targets.map((item) => ({ value: item.configuration ?? item.kit, label: `${item.name}, ${(item.configuration ?? item.kit).slice(0, 12)}` })),
        ]} onChange={(event) => dialog.choose(event.target.value)} />
        {preview && <>
          <div className="break-all text-[12px]" data-repair-preview-target={preview.target.hash}>{record.configuration ?? record.kit} → {preview.target.hash}</div>
          <BuildRepairChanges comparison={preview.plan.comparison} source={preview.sourceKit} target={preview.targetKit} />
          {preview.plan.refusal && <div role="alert">{repairRefusalText(preview.plan.refusal)}</div>}
          {preview.plan.refusal === 'checks' && dialog.choice === 'current' && <Button onClick={() => { dialog.close(); core.buildAlong.close(); void core.readiness.checkNow(); }}>Open Checks</Button>}
        </>}
      </div>
    </Modal>
  </Section>;
}
