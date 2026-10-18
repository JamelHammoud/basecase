import React, { useState } from 'react';
import { Check, ChevronRight, Loader2, X } from 'lucide-react';
import { AcpToolCallEvent } from '../../types/robotics';
import { AGENT_COLOR, ImageViewerItem } from '../../design-system';
import { toolLabel } from './toolLabel';
import { OpenImages } from './types';

const STATUS_ICON: Partial<Record<AcpToolCallEvent['status'], React.ReactNode>> = {
  completed: <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />,
  failed: <X className="w-3.5 h-3.5 text-red-400" strokeWidth={2.5} />,
};

const RUNNING_ICON = <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: AGENT_COLOR }} />;

function viewedUrls(call: AcpToolCallEvent, input: { urls?: unknown }): string[] {
  if (!/view_image/.test(`${call.toolName ?? ''} ${call.title ?? ''}`) || !Array.isArray(input.urls)) return [];

  return (input.urls as unknown[]).filter((u): u is string => typeof u === 'string');
}

const imageName = (src: string) => src.split('/').pop()?.split('?')[0] || src;

const PhotoGrid: React.FC<{ urls: string[]; onOpenImages: OpenImages }> = ({ urls, onOpenImages }) => {
  const items: ImageViewerItem[] = urls.map((src) => ({ src, name: imageName(src) }));

  return (
    <div className="ml-6 mt-1 mb-1 grid grid-cols-2 gap-1.5 animate-fade-in">
      {urls.map((u, i) => (
        <button
          key={u}
          type="button"
          aria-label={`View ${u}`}
          onClick={() => onOpenImages(items, i)}
          className="block aspect-[4/3] rounded-lg overflow-hidden bg-black/30 ring-1 ring-inset ring-white/[0.06] cursor-zoom-in"
        >
          <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  );
};

export const ToolStep: React.FC<{ call: AcpToolCallEvent; onOpenImages: OpenImages }> = ({ call, onOpenImages }) => {
  const [open, setOpen] = useState(false);
  const label = toolLabel(call);
  const input = (call.rawInput ?? {}) as { code?: string; language?: string; urls?: unknown };
  const code = typeof input.code === 'string' ? input.code : null;
  const urls = viewedUrls(call, input);
  const expandable = !!code || urls.length > 0;

  if (!label) return null;

  return (
    <div className="min-w-0">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-7 flex items-start gap-2 py-1 text-left text-[13px] cursor-default rounded-md enabled:hover:bg-white/[0.03]"
      >
        <span className="mt-[2px] w-4 h-4 flex items-center justify-center shrink-0">
          {STATUS_ICON[call.status] ?? RUNNING_ICON}
        </span>
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
          <span className="text-white/75">{label.title}</span>
          {label.detail && <span className="text-white/40"> · {label.detail}</span>}
        </span>
        {expandable && (
          <ChevronRight
            className={`mt-[3px] w-3.5 h-3.5 text-white/30 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          />
        )}
      </button>
      {open && code && (
        <pre
          data-inner-scroll
          className="ml-6 mt-1 mb-1 p-3 rounded-xl bg-black/30 ring-1 ring-inset ring-white/[0.06] max-h-72 overflow-auto text-[12px] leading-relaxed font-mono text-white/75 select-text animate-fade-in"
        >
          {code}
        </pre>
      )}
      {open && urls.length > 0 && <PhotoGrid urls={urls} onOpenImages={onOpenImages} />}
    </div>
  );
};
