import { useEffect, useRef } from 'react';
import { Viewport3D, type Viewport3DHandle } from '../Viewport3D';
import type { WorkspaceCore } from '../../workspace/useWorkspaceCore';
import { BuildAlongBar } from './BuildAlongBar';
import { downloadBytes } from '../../utils/downloadBytes';
import { frozenClient } from '../../kit/frozenClient';
import { errorMessage } from '../../utils/errorMessage';
import { frozenOutputSelection } from '../../kit/frozenPartOutput';

const ignore = () => {};

export function FrozenBuildView({ core, active }: { core: WorkspaceCore; active: boolean }) {
  const viewport = useRef<Viewport3DHandle | null>(null);
  const { buildAlong, studio, tool } = core;
  const frozen = buildAlong.frozen;

  useEffect(() => {
    void viewport.current?.meshesReady().then(() => viewport.current?.frameAll());
  }, [frozen?.record.id]);

  if (!frozen) return null;

  const exportPart = async (id: string) => {
    const client = frozenClient();

    try {
      const output = await client.call('partOutput', frozenOutputSelection(frozen.kit, frozen.repair?.affected ?? [id]));

      if (output) downloadBytes(output.bytes, output.name, output.type);
    } catch (error) {
      core.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      client.dispose();
    }
  };

  return (
    <div className="absolute inset-0 z-10" data-frozen-build={frozen.record.id}>
      <Viewport3D
        ref={viewport}
        sceneKey={frozen.repair?.id ?? frozen.record.configuration ?? frozen.record.kit}
        parts={frozen.parts}
        selectedPartIds={[]}
        transformMode="translate"
        sculptSettings={tool.sculptSettings}
        snapStepMm={studio.snapStepMm}
        snapAngleDeg={studio.snapAngleDeg}
        trackpadMode={studio.trackpadMode}
        showGrid={studio.showGrid}
        onSelectPart={ignore}
        onUpdatePartTransform={ignore}
        onCommitSculptMesh={ignore}
        paused={!active}
        buildStep={buildAlong.view}
      />
      <BuildAlongBar buildAlong={buildAlong} active={active} ready={[]} printLabel="Export 3MF" onPrint={(id) => void exportPart(id)} />
    </div>
  );
}
