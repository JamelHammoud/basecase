import { boardPoseOwners, boardSelection } from '../wiring/boardComponents';
import type { WorkspaceCore } from './useWorkspaceCore';

export function boardSelectionProps({ project, selection }: Pick<WorkspaceCore, 'project' | 'selection'>) {
  const idFor = (id: string | null) => boardSelection(id, project.electronicsBoard);

  return {
    poseOwners: boardPoseOwners(project.electronicsBoard),
    onSelectPart: (id: string | null, additive?: boolean, drill?: boolean) =>
      selection.select(idFor(id), additive, drill),
    onMarqueeSelect: (ids: string[]) => selection.marqueeSelect([...new Set(ids.map((id) => idFor(id) ?? id))]),
  };
}
