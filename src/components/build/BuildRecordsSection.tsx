import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Button,
  IconButton,
  Modal,
  RowActions,
  Section,
  TextInput,
  DeleteIcon,
  confirmAction,
  NumberInput,
  FieldRow,
} from '../../design-system';
import { localBuilds, type BuildSummary } from '../../kit/buildRecords';
import { BuildRepairFleet } from './BuildRepairFleet';
import { BuildRepairSection } from './BuildRepairSection';
import { prepareFrozenBuild } from '../../workspace/prepareFrozenBuild';
import { errorMessage } from '../../utils/errorMessage';
import { useLatestRef } from '../../utils/useLatestRef';
import type { WorkspaceCore } from '../../workspace/useWorkspaceCore';
import { FrozenBuildFindings } from './FrozenBuildFindings';
import { BuildAllocations } from './BuildAllocations';
import { RetainedAllocations } from './RetainedAllocations';

export function BuildRecordsSection({ core }: { core: WorkspaceCore }) {
  const [records, setRecords] = useState<BuildSummary[]>([]);
  const [name, setName] = useState(core.scene.sceneName);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const current = useLatestRef(core);
  const { buildAlong, showToast } = core;
  const fail = (error: unknown) => showToast(errorMessage(error), { tone: 'error' });
  const load = useEffectEvent(() => localBuilds.list().then(setRecords).catch(fail));

  useEffect(() => {
    if (core.active) void load();

    return () => abort.current?.abort();
  }, [core.active]);

  const cancel = () => {
    abort.current?.abort();
    buildAlong.cancelCreate();
  };
  const create = async () => {
    if (abort.current) return;

    const controller = new AbortController();

    abort.current = controller;
    setBusy(true);

    try {
      const { content } = await prepareFrozenBuild(core, controller.signal, () => current.current);

      const names = Array.from({ length: quantity }, (_, index) =>
        quantity === 1 ? name : `${name.slice(0, 110)} ${index + 1}`,
      );

      await localBuilds.createMany(names, content, controller.signal);
      setRecords(await localBuilds.list());
      buildAlong.cancelCreate();
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };
  const remove = (record: BuildSummary) =>
    confirmAction({
      title: `Delete ${record.name}?`,
      onConfirm: () => {
        void localBuilds
          .remove(record.id)
          .then(async () => {
            if (buildAlong.frozen?.record.id === record.id) buildAlong.close();

            setRecords(await localBuilds.list());
          })
          .catch(fail);
      },
    });

  return (
    <Section title="Builds">
      <Button fullWidth disabled={buildAlong.active || busy || !core.parts.length} onClick={buildAlong.requestCreate}>
        Make Build
      </Button>
      <div className="mt-2">
        {records.map((record) => (
          <div key={record.id} className="group relative rounded-lg hover:bg-[#333333]">
            <Button
              fullWidth
              variant={buildAlong.frozen?.record.id === record.id ? 'active' : 'ghost'}
              aria-pressed={buildAlong.frozen?.record.id === record.id}
              onClick={() => void buildAlong.openFrozen(record.id)}
            >
              {record.name}
            </Button>
            <RowActions fill="#333333" className="right-0 top-0">
              <IconButton title="Delete" variant="danger" icon={<DeleteIcon />} onClick={() => remove(record)} />
            </RowActions>
          </div>
        ))}
      </div>
      {buildAlong.frozen && <BuildRepairSection key={buildAlong.frozen.record.id} core={core} records={records} onChanged={() => void localBuilds.list().then(setRecords).catch(fail)} />}
      {buildAlong.frozen && <FrozenBuildFindings kit={buildAlong.frozen.kit} />}
      {buildAlong.frozen && <BuildAllocations frozen={buildAlong.frozen} onError={fail} />}
      {buildAlong.frozen?.record.repairs?.at(-1) && <Section title="Fleet" collapsible defaultOpen={false} className="!px-0 !border-b-0"><BuildRepairFleet repair={buildAlong.frozen.record.repairs.at(-1)!} onChanged={() => void buildAlong.openFrozen(buildAlong.frozen!.record.id)} onError={fail} /></Section>}
      <RetainedAllocations builds={records} onError={fail} />
      <Modal
        isOpen={buildAlong.creating}
        onClose={cancel}
        title="Make Build"
        action={{ label: 'Make', disabled: busy || !name.trim(), onClick: () => void create() }}
      >
        <div className="space-y-3">
          <TextInput
            aria-label="Build name"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldRow label="Quantity">
            <NumberInput
              aria-label="Quantity"
              value={quantity}
              min={1}
              max={20}
              precision={0}
              unit=""
              disabled={busy}
              onChange={setQuantity}
            />
          </FieldRow>
        </div>
      </Modal>
    </Section>
  );
}
