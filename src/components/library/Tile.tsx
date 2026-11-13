import React, { useRef, useState } from 'react';
import { MODEL_DRAG_TYPE, setSceneDrag } from '../../data/dnd';
import { HoverCard, Tooltip, PlusIcon } from '../../design-system';

const HIDDEN_UNTIL_HOVER =
  'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto';

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

export const Tile: React.FC<{
  name: string;
  meta: React.ReactNode;
  thumb: string | undefined;
  renaming: boolean;
  onInsert: () => void;
  modelId: string;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onMenu: (e: React.MouseEvent) => void;
  details: () => React.ReactNode;
}> = ({
  name,
  meta,
  thumb,
  renaming,
  onInsert,
  modelId,
  onStartRename,
  onRename,
  onMenu,
  details,
}) => {
  const body = (
    <div
      data-library-tile
      className="group relative w-full"
      onContextMenu={onMenu}
      draggable={!renaming}
      onDragStart={(e) => {
        setSceneDrag(e.dataTransfer, MODEL_DRAG_TYPE, modelId);
        e.dataTransfer.effectAllowed = 'copy';

        const img = (e.currentTarget as HTMLElement).querySelector('img');

        if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
      }}
    >
      <button
        type="button"
        onClick={onInsert}
        aria-label={`Insert: ${name}`}
        className="preview block w-full aspect-[4/3] cursor-default active:scale-[0.98] transition-[background-color,transform] duration-150"
      >
        <TileThumb thumb={thumb} />
      </button>

      <div className="pl-0.5 pt-2 cursor-default" onClick={renaming ? undefined : onInsert}>
        {renaming ? (
          <RenameField name={name} onDone={onRename} />
        ) : (
          <div
            className="text-[13px] leading-[19px] font-medium text-white/90 truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
          >
            {name}
          </div>
        )}
        <div className="text-[12px] text-white/50 tabular truncate">{meta}</div>
      </div>

      {!renaming && (
        <Tooltip
          label="Insert"
          className={`absolute top-[8px] right-[8px] transition-opacity ${HIDDEN_UNTIL_HOVER}`}
        >
          <button
            type="button"
            aria-label={`Insert ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onInsert();
            }}
            className="w-7 h-7 rounded-full bg-[#0d99ff] text-white flex items-center justify-center cursor-default shadow-[0_2px_6px_rgba(0,0,0,0.4)] hover:bg-[#2ba5ff] active:scale-[0.94] transition-[background-color,transform] duration-150"
          >
            <PlusIcon className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        </Tooltip>
      )}
    </div>
  );

  return renaming ? (
    body
  ) : (
    <HoverCard content={details} beside="aside" className="w-full">
      {body}
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
