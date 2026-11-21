import { useEffect, useRef, useState } from 'react';
import { compositionJobs } from '../three/composition/client';
import {
  defaultComposition,
  readComposition,
  validComposition,
  type CompositionSettings,
} from '../three/composition/settings';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { fileSafe } from './helpers';
import { useLatestRef } from '../utils/useLatestRef';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useRenderComposition(core: WorkspaceCore) {
  'use memo';

  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    parts: WorkspaceCore['parts'];
    pose: WorkspaceCore['project']['pose'];
    scene: string;
  } | null>(null);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const latest = useLatestRef(core);
  const settings = readComposition(core.project.rendering);
  const cancel = () => active.current?.abort();

  useEffect(
    () => () => active.current?.abort(),
    [core.parts, core.project.pose, core.project.joints, core.scene.sceneId, core.active, core.project.rendering],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const update = (patch: Partial<CompositionSettings>) => {
    cancel();
    setPreview(null);
    setError('');
    core.docs.updateProjectNow((project) => ({
      ...project,
      rendering: { ...readComposition(project.rendering), ...patch },
    }));
  };

  const run = async (mode: 'preview' | 'frame' | 'export') => {
    cancel();

    const abort = new AbortController();
    const snapshot = { parts: core.parts, pose: core.viewportRef.current?.renderPose() ?? {} };
    const sourcePose = core.project.pose;
    const sourceJoints = core.project.joints;
    const sourceScene = core.scene.sceneId;

    active.current = abort;
    setBusy(true);
    setError('');

    try {
      const result = await compositionJobs.run({ snapshot, settings, frame: mode === 'frame' }, abort.signal);

      abort.signal.throwIfAborted();

      const sourceCurrent = () =>
        latest.current.docs.partsRef.current === snapshot.parts &&
        latest.current.docs.projectRef.current.pose === sourcePose &&
        latest.current.docs.projectRef.current.joints === sourceJoints &&
        latest.current.docs.projectRef.current.rendering === core.project.rendering &&
        latest.current.active &&
        latest.current.scene.sceneId === sourceScene;

      if (!sourceCurrent()) return;

      if (mode === 'frame') update({ view: result.view });

      setPreview({
        url: URL.createObjectURL(result.png),
        parts: snapshot.parts,
        pose: sourcePose,
        scene: core.scene.sceneId,
      });
      performance.clearMeasures('composition:export');
      performance.measure('composition:export', {
        start: 0,
        duration:
          result.metrics.totalMs ?? result.metrics.preparationMs + result.metrics.renderMs + result.metrics.encodingMs,
        detail: result.metrics,
      });

      if (mode !== 'export') return;

      const bytes = new Uint8Array(await result.png.arrayBuffer());

      abort.signal.throwIfAborted();

      if (!sourceCurrent()) return;

      downloadBytes(bytes, `${fileSafe(core.scene.sceneName)}.png`, 'image/png');
      core.showToast('Exported image');
    } catch (failure) {
      if (abort.signal.aborted || (failure instanceof DOMException && failure.name === 'AbortError')) return;

      setError(errorMessage(failure));
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(false);
      }
    }
  };

  return {
    open: open === core.scene.sceneId && core.active,
    show: () => {
      const view = core.viewportRef.current?.currentView();

      if (!core.project.rendering && view) update({ ...defaultComposition(), view });

      setOpen(core.scene.sceneId);
    },
    close: () => {
      cancel();
      setOpen(null);
      setPreview(null);
    },
    cancel,
    settings,
    valid: validComposition(settings),
    update,
    currentView: () => {
      const view = core.viewportRef.current?.currentView();

      if (view) update({ view });
    },
    run,
    busy,
    preview:
      preview?.parts === core.parts && preview.pose === core.project.pose && preview.scene === core.scene.sceneId
        ? preview.url
        : null,
    error,
  };
}

export type RenderComposition = ReturnType<typeof useRenderComposition>;
