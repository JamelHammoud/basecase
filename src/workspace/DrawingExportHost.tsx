import { ErrorBoundary } from '../design-system';
import { DrawingExportSheet } from './DrawingExportSheet';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { ExportActions } from './useExportActions';

export function DrawingExportHost({
  active,
  core,
  exports,
}: {
  active: boolean;
  core: WorkspaceCore;
  exports: ExportActions;
}) {
  const { drawings } = exports;

  if (!active || !drawings.isOpen) return null;

  return (
    <ErrorBoundary region={drawings.mode === 'kit' ? 'Kit' : 'Drawings'} onClose={drawings.close}>
      <DrawingExportSheet
        mode={drawings.mode}
        parts={core.parts}
        selectedIds={core.selectedIds}
        onClose={drawings.close}
        onExport={(selection) => void drawings.run(selection)}
      />
    </ErrorBoundary>
  );
}
