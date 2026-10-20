import React, { useState } from 'react';
import { AcpToolCallEvent } from '../../types/robotics';
import { CodeBlock, ImageViewerItem } from '../../design-system';
import { isToolRunning, ToolLabel, toolIcon, toolLabel } from './toolLabel';
import { LinkedText } from './PartLinksProvider';
import { StepRow } from './StepRow';
import { OpenImages } from './types';
import { DisclosureBody } from './Disclosure';

function viewedUrls(call: AcpToolCallEvent, input: { urls?: unknown }): string[] {
  if (!/view_image/.test(`${call.toolName ?? ''} ${call.title ?? ''}`) || !Array.isArray(input.urls)) return [];

  return (input.urls as unknown[]).filter((u): u is string => typeof u === 'string');
}

const imageName = (src: string) => src.split('/').pop()?.split('?')[0] || src;

const PhotoGrid: React.FC<{ urls: string[]; onOpenImages: OpenImages }> = ({ urls, onOpenImages }) => {
  const items: ImageViewerItem[] = urls.map((src) => ({ src, name: imageName(src) }));

  return (
    <div className="grid grid-cols-2 gap-1.5">
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

const StepDetails: React.FC<{
  label: ToolLabel;
  code: string | null;
  language?: string;
  urls: string[];
  onOpenImages: OpenImages;
}> = ({ label, code, language, urls, onOpenImages }) => (
  <div className="pl-6 pr-1 pt-0.5 pb-1 space-y-1.5">
    {label.detail && (
      <p className="text-[13px] leading-[21px] text-white/50 [overflow-wrap:anywhere] select-text">
        <LinkedText text={label.detail} />
      </p>
    )}
    {code && <CodeBlock code={code} language={language} title={label.title} />}
    {urls.length > 0 && <PhotoGrid urls={urls} onOpenImages={onOpenImages} />}
  </div>
);

export const ToolStep: React.FC<{ call: AcpToolCallEvent; onOpenImages: OpenImages }> = ({ call, onOpenImages }) => {
  const [open, setOpen] = useState(false);
  const label = toolLabel(call);
  const input = (call.rawInput ?? {}) as { code?: string; language?: string; urls?: unknown };
  const code = typeof input.code === 'string' ? input.code : null;
  const urls = viewedUrls(call, input);

  if (!label) return null;

  const expandable = !!label.detail || !!code || urls.length > 0;

  return (
    <div className="min-w-0">
      <StepRow
        icon={toolIcon(call)}
        title={label.title}
        running={isToolRunning(call)}
        failed={call.status === 'failed'}
        expandable={expandable}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {expandable && (
        <DisclosureBody open={open} onClose={() => setOpen(false)}>
          <StepDetails label={label} code={code} language={input.language} urls={urls} onOpenImages={onOpenImages} />
        </DisclosureBody>
      )}
    </div>
  );
};
