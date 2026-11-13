import React, { useRef, useState } from 'react';
import { MODEL_DRAG_TYPE, setSceneDrag } from '../../data/dnd';
import { HoverCard } from '../../design-system';

const TileThumb: React.FC<{ thumb: string | undefined }> = ({ thumb }) => {
  if (thumb) {
    return (
      <img
        src={thumb}
        alt=""
        draggable={false}
        className="w-full h-full object-contain p-1.5 animate-fade-in transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
      />
    );
  }

  if (thumb === '') {
    return (
      <span className="w-full h-full flex items-center justify-center text-[12px] text-white/50">No preview</span>
    );
  }

  return (
    <span className="block w-full h-full shimmer" />
  );
};

const TileText: React.FC<{ meta: React.ReactNode; children: React.ReactNode }> = ({ meta, children }) => (
  <div className="pl-0.5 pt-2">
    {children}
    <div className="text-[12px] text-white/50 tabular truncate">{meta}</div>
  </div>
);

const TILE_NAME = 'text-[13px] leading-[19px] font-medium text-white/90 truncate';

export const Tile: React.FC<{
  name: string;
  meta: React.ReactNode;
  thumb: string | undefined;
  renaming: boolean;
  onInsert: () => void;
  modelId: string;
  onRename: (name: string) => void;
  onMenu: (e: React.MouseEvent) => void;
  details: () => React.ReactNode;
}> = ({ name, meta, thumb, renaming, onInsert, modelId, onRename, onMenu, details }) => {
  if (renaming) {
    return (
      <div data-library-tile className="w-full">
        <div className="preview aspect-[4/3]">
          <TileThumb thumb={thumb} />
        </div>
        <TileText meta={meta}>
          <RenameField name={name} onDone={onRename} />
        </TileText>
      </div>
    );
  }

  return (
    <HoverCard content={details} beside="aside" className="w-full">
      <button
        type="button"
        data-library-tile
        onClick={onInsert}
        onContextMenu={onMenu}
        draggable
        onDragStart={(e) => {
          setSceneDrag(e.dataTransfer, MODEL_DRAG_TYPE, modelId);
          e.dataTransfer.effectAllowed = 'copy';

          const img = e.currentTarget.querySelector('img');

          if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
        }}
        className="group w-full text-left cursor-default active:scale-[0.98] transition-transform duration-150"
      >
        <div className="preview aspect-[4/3]">
          <TileThumb thumb={thumb} />
        </div>
        <TileText meta={meta}>
          <div className={TILE_NAME}>{name}</div>
        </TileText>
      </button>
    </HoverCard>
  );
};

export const RenameField: React.FC<{ name: string; onDone: (name: string) => void }> = ({ name, onDone }) => {
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const finish = (value: string) => {
    if (done.current) return;

    done.current = true;
    onDone(value.trim());
  };

  return (
    <input
      autoFocus
      value={draft}
      spellCheck={false}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(draft);

        if (e.key === 'Escape') finish(name);
      }}
      aria-label="Name"
      className="block w-[calc(100%+20px)] -ml-1 -my-[1px] h-[21px] px-1 rounded-[5px] bg-black/30 ring-1 ring-[#0d99ff] outline-none text-[13px] font-medium text-white/95"
    />
  );
};

export const InlineEmpty: React.FC<{ title: string; action: React.ReactNode }> = ({ title, action }) => (
  <div className="mx-1 mb-1 rounded-xl bg-white/[0.025] ring-1 ring-inset ring-white/[0.04] px-3 py-5 flex flex-col items-center gap-3 text-center">
    <div className="text-[13px] text-white/50">{title}</div>
    {action}
  </div>
);
