import { useEffect, useState } from 'react';
import { compositionMatches, compositionPose, sameRenderPose, type CompositionSource } from './compositionSource';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useCompositionPreview(core: WorkspaceCore) {
  const [preview, setPreview] = useState<{ url: string; source: CompositionSource } | null>(null);

  useEffect(() => {
    if (!preview) return;

    const viewport = core.viewportRef.current;
    const stop = viewport?.onRender(() => {
      if (!sameRenderPose(preview.source.matrices, compositionPose(viewport, preview.source.parts))) setPreview(null);
    });

    return () => {
      stop?.();
      URL.revokeObjectURL(preview.url);
    };
  }, [preview, core.viewportRef]);

  return {
    preview: preview && compositionMatches(core, preview.source) ? preview.url : null,
    clear: () => setPreview(null),
    show: (png: Blob, source: CompositionSource) => setPreview({ url: URL.createObjectURL(png), source }),
  };
}
