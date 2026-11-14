import React, { useLayoutEffect, useRef, useState } from 'react';
import { AcpChatMessage } from '../../types/robotics';
import { Markdown, remarkLineBreaks, FolderIcon } from '../../design-system';
import { usePartMarkdown } from './PartLinksProvider';
import { QuoteBlock } from './QuoteBlock';
import { OpenImages } from './types';

const COLLAPSED_PX = 212;

type FolderAttachment = NonNullable<AcpChatMessage['folderAttachments']>[number];

const imagesOf = (msg: AcpChatMessage) => msg.imageAttachments ?? (msg.imageAttachment ? [msg.imageAttachment] : []);

const ImageGrid: React.FC<{ images: string[]; onOpenImages: OpenImages }> = ({ images, onOpenImages }) => {
  const several = images.length > 1;

  return (
    <div className={`grid gap-1.5 ${several ? 'grid-cols-2' : ''} ${images.length > 4 ? 'sm:grid-cols-3' : ''}`}>
      {images.map((src, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Open image ${i + 1}`}
          onClick={() =>
            onOpenImages(
              images.map((s, n) => ({ src: s, name: `Image ${n + 1}` })),
              i,
            )
          }
          className="block rounded-xl overflow-hidden bg-black/30 cursor-zoom-in transition-transform duration-150 active:scale-[0.97]"
        >
          <img
            src={src}
            alt=""
            className={`w-full object-contain ${several ? 'aspect-square object-cover' : 'max-h-44'}`}
          />
        </button>
      ))}
    </div>
  );
};

const FolderChips: React.FC<{ folders: FolderAttachment[] }> = ({ folders }) => (
  <div className="flex flex-wrap gap-1.5">
    {folders.map((f) => (
      <span
        key={f.id}
        className="h-[28px] max-w-full px-2.5 rounded-lg bg-white/[0.06] flex items-center gap-1.5 min-w-0"
      >
        <FolderIcon className="w-3.5 h-3.5 text-white/60 shrink-0" />
        <span className="text-[13px] text-white/85 truncate">{f.name}</span>
        <span className="text-[12px] text-white/50 tabular shrink-0">{f.fileCount}</span>
      </span>
    ))}
  </div>
);

const ClampedText: React.FC<{ text: string }> = ({ text }) => {
  const textRef = useRef<HTMLDivElement | null>(null);
  const partLinks = usePartMarkdown();
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;

    if (!el) return;

    const measure = () => setLong(el.scrollHeight > COLLAPSED_PX + 24);

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(el);

    return () => observer.disconnect();
  }, [text]);

  const clamp = long && !expanded;
  const fade = clamp ? 'linear-gradient(to bottom, #000 calc(100% - 48px), transparent)' : undefined;

  return (
    <div>
      <div
        ref={textRef}
        className="[overflow-wrap:anywhere] overflow-hidden"
        style={{ maxHeight: clamp ? COLLAPSED_PX : undefined, maskImage: fade, WebkitMaskImage: fade }}
      >
        <Markdown
          remarkPlugins={[remarkLineBreaks, ...(partLinks.remarkPlugins ?? [])]}
          onInternalLink={partLinks.onInternalLink}
          linkPreview={partLinks.linkPreview}
        >
          {text}
        </Markdown>
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 -ml-1 h-[32px] px-1.5 rounded-md text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] cursor-default transition-colors"
        >
          {expanded ? 'Show Less' : 'Show More'}
        </button>
      )}
    </div>
  );
};

export const UserMessage: React.FC<{
  msg: AcpChatMessage;
  onOpenImages: OpenImages;
  onContextMenu: (e: React.MouseEvent) => void;
}> = ({ msg, onOpenImages, onContextMenu }) => {
  const images = imagesOf(msg);
  const folders = msg.folderAttachments ?? [];

  return (
    <div className="flex flex-col items-end animate-fade-in min-w-0">
      <div
        onContextMenu={onContextMenu}
        className="max-w-[85%] min-w-0 rounded-[18px] bg-white/[0.08] px-3.5 py-2.5 space-y-2"
      >
        {images.length > 0 && <ImageGrid images={images} onOpenImages={onOpenImages} />}
        {folders.length > 0 && <FolderChips folders={folders} />}
        {msg.quotes?.map((quote) => (
          <QuoteBlock key={quote.id} quote={quote} />
        ))}
        {msg.text && <ClampedText text={msg.text} />}
      </div>
    </div>
  );
};
