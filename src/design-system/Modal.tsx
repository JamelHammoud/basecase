import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = 'max-w-2xl',
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-8 bg-black/50 animate-fade-in"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxWidth} max-h-[82vh] flex flex-col rounded-2xl bg-[#222222] ring-1 ring-white/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden animate-sheet-in`}
      >
        <div className="flex items-center justify-between gap-[12px] min-h-[60px] px-[20px] py-[16px] shrink-0">
          <div className="flex items-center gap-[12px] min-w-0">
            {icon && (
              <span className="w-[28px] h-[28px] rounded-[8px] bg-white/[0.06] flex items-center justify-center text-white/80 shrink-0">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-white truncate">{title}</h2>
              {subtitle && <p className="text-[13px] text-white/50 mt-[2px]">{subtitle}</p>}
            </div>
          </div>
          <IconButton icon={<X className="w-4 h-4" />} title="Close" shortcut="Esc" onClick={onClose} size="sm" />
        </div>

        <div className="px-[20px] pb-[20px] overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-[20px] py-[12px] border-t border-white/[0.06] flex items-center justify-end gap-[8px] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
