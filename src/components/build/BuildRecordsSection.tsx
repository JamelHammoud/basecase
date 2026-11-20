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
} from '../../design-system';
import { localBuilds, type BuildSummary } from '../../kit/buildRecords';
import { frozenClient } from '../../kit/frozenClient';
import { errorMessage } from '../../utils/errorMessage';
import { useLatestRef } from '../../utils/useLatestRef';
import { kitGuard, prepareKit } from '../../workspace/kitExport';
import type { WorkspaceCore } from '../../workspace/useWorkspaceCore';
import { FrozenBuildFindings } from './FrozenBuildFindings';

export function BuildRecordsSection({ core }: { core: WorkspaceCore }) {
  const [records, setRecords] = useState<BuildSummary[]>([]);
  const [name, setName] = useState(core.scene.sceneName);
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
    const run = { signal: controller.signal, current: () => current.current, assemblyOnly: true };
    const guard = kitGuard(core, run);
    const client = frozenClient();

    abort.current = controller;
    setBusy(true);
    controller.signal.addEventListener('abort', client.dispose, { once: true });

    try {
      const job = await prepareKit(core, run);
      const meshes = await core.viewportRef.current!.printMeshes(
        job.parts.filter((part) => part.role === 'solid').map((part) => part.id),
      );

      guard();

      const content = await client.call('prepare', { job, meshes });

      guard();
      await localBuilds.create(name, content, controller.signal);
      setRecords(await localBuilds.list());
      buildAlong.cancelCreate();
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      controller.signal.removeEventListener('abort', client.dispose);
      client.dispose();
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
      {buildAlong.frozen && <FrozenBuildFindings kit={buildAlong.frozen.kit} />}
      <Modal
        isOpen={buildAlong.creating}
        onClose={cancel}
        title="Make Build"
        action={{ label: 'Make', disabled: busy || !name.trim(), onClick: () => void create() }}
      >
        <TextInput
          aria-label="Build name"
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </Modal>
    </Section>
  );
}
