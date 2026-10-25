import React from 'react';
import { MetaLine, Tooltip, CloseIcon, FolderIcon, SpinnerIcon } from '../../design-system';
import { Attachments, FolderChip } from './useAttachments';
import { OpenImages } from './types';

const RemoveChip: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#3a3a3a] ring-2 ring-[#1f1f1f] text-white/80 hover:text-white flex items-center justify-center cursor-default"
  >
    <CloseIcon className="w-3 h-3" strokeWidth={3} />
  </button>
);

function folderMeta(f: FolderChip): string[] {
  if (!f.ready) return [`${f.done} of ${f.total}`];

  const files = `${f.fileCount} file${f.fileCount === 1 ? '' : 's'}`;

  return f.skipped ? [files, `${f.skipped} skipped`] : [files];
}

const FolderTile: React.FC<{ folder: FolderChip; onRemove: () => void }> = ({ folder: f, onRemove }) => (
  <div className="relative animate-pop-up min-w-0 max-w-full">
    <div className="h-14 max-w-[220px] pl-2.5 pr-3.5 rounded-xl bg-white/[0.06] ring-1 ring-white/10 flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center shrink-0">
        {f.ready ? (
          <FolderIcon className="w-4 h-4 text-white/75" />
        ) : (
          <SpinnerIcon className="w-4 h-4 animate-spin text-white/50" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-white/90 truncate">{f.name}</span>
        <MetaLine className="text-[12px] text-white/45 tabular" items={folderMeta(f)} />
      </span>
    </div>
    <RemoveChip label={`Remove ${f.name}`} onClick={onRemove} />
  </div>
);

export const AttachmentTray: React.FC<{ attachments: Attachments; onOpenImages: OpenImages }> = ({
  attachments: { images, folders, uploadingCount, removeImage, removeFolder },
  onOpenImages,
}) => {
  if (!images.length && !folders.length && !uploadingCount) return null;

  return (
    <div className="px-2.5 pt-2.5 flex flex-wrap gap-2 max-h-[164px] overflow-y-auto overflow-x-hidden">
      {folders.map((f) => (
        <FolderTile key={f.key} folder={f} onRemove={() => removeFolder(f.key)} />
      ))}
      {images.map((img, i) => (
        <div key={img.id} className="relative animate-pop-up">
          <Tooltip label={img.name} side="top">
            <button
              type="button"
              aria-label={`View ${img.name}`}
              onClick={() =>
                onOpenImages(
                  images.map((a) => ({ src: a.dataUrl, name: a.name })),
                  i,
                )
              }
              className="block w-14 h-14 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10 cursor-zoom-in transition-transform duration-150 active:scale-[0.96]"
            >
              <img src={img.dataUrl} alt="" className="w-full h-full object-cover" />
            </button>
          </Tooltip>
          <RemoveChip label={`Remove ${img.name}`} onClick={() => removeImage(img.id)} />
        </div>
      ))}
      {Array.from({ length: uploadingCount }).map((_, i) => (
        <span key={`up-${i}`} className="w-14 h-14 rounded-xl bg-white/[0.06] flex items-center justify-center">
          <SpinnerIcon className="w-4 h-4 animate-spin text-white/50" />
        </span>
      ))}
    </div>
  );
};
