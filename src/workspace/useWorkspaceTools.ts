import type { SceneWorkspaceProps, Setter, ShowToast } from './types';
import { useAnnotations } from './useAnnotations';
import { useMarks, useMarkState } from './useMarks';
import { useMeasure } from './useMeasure';
import type { SceneDocument } from './useSceneDocument';
import { useToolMode } from './useToolMode';

interface WorkspaceToolsOptions extends Pick<SceneWorkspaceProps, 'seed' | 'studio'> {
  docs: SceneDocument;
  showToast: ShowToast;
  setSelectedIds: Setter<string[]>;
}

export function useWorkspaceTools({ docs, seed, studio, showToast, setSelectedIds }: WorkspaceToolsOptions) {
  const measure = useMeasure();
  const { setMeasuring } = measure;
  const markState = useMarkState();
  const { setMarking } = markState;
  const annotations = useAnnotations({
    initial: seed?.annotations ?? [],
    parts: docs.parts,
    showToast,
    setSelectedIds,
    stopTools: () => {
      setMeasuring(false);
      setMarking(false);
    },
  });
  const tool = useToolMode({
    setIsRightOpen: studio.setIsRightOpen,
    annotations,
    measure,
    mark: { marking: markState.marking, setMarking },
  });
  const marks = useMarks({ docs, showToast, selection: markState.selection, tool: markState.tool });

  return { measure, annotations, tool, marks };
}
