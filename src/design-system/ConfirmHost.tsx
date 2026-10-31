import React, { useSyncExternalStore } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { currentConfirm, setConfirmRequest, subscribeConfirm } from './confirmStore';

export const ConfirmHost: React.FC = () => {
  const request = useSyncExternalStore(subscribeConfirm, currentConfirm);

  if (!request) return null;

  const confirm = () => {
    setConfirmRequest(null);
    request.onConfirm();
  };

  return (
    <ConfirmDialog
      isOpen
      title={request.title}
      confirmLabel={request.confirmLabel}
      onCancel={() => setConfirmRequest(null)}
      onConfirm={confirm}
    >
      {request.body}
    </ConfirmDialog>
  );
};
