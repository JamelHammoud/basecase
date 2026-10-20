import React from 'react';
import { AlertIcon, SpinnerIcon, TickIcon } from './glyphs';

export interface ToastData {
  id: number;
  message: string;
  tone?: 'success' | 'error' | 'progress' | 'neutral';
  action?: { label: string; onClick: () => void };
}

export const Toast: React.FC<{ toast: ToastData; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const tone = toast.tone ?? 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-menu rounded-full h-10 pl-3.5 pr-1.5 flex items-center gap-2 text-[13.5px] text-white/90 animate-toast-in"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {tone === 'success' && <TickIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" strokeWidth={2.5} />}
      {tone === 'error' && <AlertIcon className="w-3.5 h-3.5 text-red-400 shrink-0" />}
      {tone === 'progress' && <SpinnerIcon className="w-3.5 h-3.5 text-white/60 animate-spin shrink-0" />}
      <span className={`truncate max-w-md ${toast.action ? '' : 'pr-1.5'}`}>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="h-7 px-3 rounded-full text-[13px] font-medium text-[#5cb8ff] hover:bg-white/[0.08] cursor-default transition-colors"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
};
