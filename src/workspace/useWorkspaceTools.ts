import { useAnnotations } from './useAnnotations';
import { useMarkState } from './useMarks';
import { useMeasure } from './useMeasure';
import { useToolMode } from './useToolMode';
import type { Setter } from './types';

interface WorkspaceToolsOptions extends Omit<Parameters<typeof useAnnotations>[0], 'stopTools'> {
  setIsRightOpen: Setter<boolean>;
}

export function useWorkspaceTools({
  initial,
  parts,
  showToast,
  setSelectedIds,
  setIsRightOpen,
}: WorkspaceToolsOptions) {
  const measure = useMeasure();
  const { setMeasuring } = measure;
  const markState = useMarkState();
  const { setMarking } = markState;
  const annotations = useAnnotations({
    initial,
    parts,
    showToast,
    setSelectedIds,
    stopTools: () => {
      setMeasuring(false);
      setMarking(false);
    },
  });
  const tool = useToolMode({
    setIsRightOpen,
    annotations,
    measure,
    mark: { marking: markState.marking, setMarking },
  });

  return { measure, markState, annotations, tool };
}
