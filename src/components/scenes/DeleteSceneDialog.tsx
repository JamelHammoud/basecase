import React from 'react';
import { ConfirmDialog } from '../../design-system';
import type { SavedSceneSummary } from '../../types/robotics';

export const DeleteSceneDialog: React.FC<{
  scene: SavedSceneSummary | null;
  onCancel: () => void;
  onDelete: (scene: SavedSceneSummary) => void;
}> = ({ scene, onCancel, onDelete }) => (
  <ConfirmDialog
    isOpen={!!scene}
    title={`Delete ${scene?.name ?? ''}?`}
    onCancel={onCancel}
    onConfirm={() => scene && onDelete(scene)}
  >
    <p>You can’t undo this.</p>
  </ConfirmDialog>
);
