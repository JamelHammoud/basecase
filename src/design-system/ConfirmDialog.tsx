import React from 'react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  children,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    title={title}
    maxWidth="max-w-[400px]"
    action={{ label: confirmLabel, tone: 'danger', autoFocus: true, onClick: onConfirm }}
  >
    {children && <div className="text-[13px] leading-[19px] text-white/60">{children}</div>}
  </Modal>
);

export const isModalOpen = () => !!document.querySelector('[aria-modal="true"]');
