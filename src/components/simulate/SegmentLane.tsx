import React, { useState } from 'react';
import { ContextMenu, RenameField, renameEntry } from '../../design-system';
import { segmentAt, type TrySegment } from '../../cases/tryLabels';
import type { TryTimeline } from '../../workspace/useTryTimeline';
import { TagSheet } from '../tries/TagSheet';
import { TAG_ITEM } from '../../workspace/useTryLabelling';
import { framePercent, useEdgeDrag } from './useEdgeDrag';

interface SegmentBlockProps {
  segment: TrySegment;
  frames: number;
  selected: boolean;
  onPick: () => void;
  onRename: () => void;
  onMenu: (e: React.MouseEvent) => void;
}

const RENAME_WIDTH = 180;

const SegmentBlock: React.FC<SegmentBlockProps> = ({ segment, frames, selected, onPick, onRename, onMenu }) => {
  const left = framePercent(segment.start, frames);

  return (
    <button
      type="button"
      data-testid="segment-block"
      data-label={segment.label}
      data-start={segment.start}
      data-end={segment.end}
      aria-pressed={selected}
      className="absolute inset-y-0 px-px py-0.5 cursor-default"
      style={{ left: `${left}%`, width: `${framePercent(segment.end, frames) - left}%` }}
      onClick={onPick}
      onDoubleClick={onRename}
      onContextMenu={onMenu}
    >
      <span
        className={`flex h-full min-w-0 items-center rounded-[6px] px-1.5 text-[12px] transition-colors ${
          selected
            ? 'bg-[#0d99ff]/25 text-white/95 ring-1 ring-inset ring-[#0d99ff]/70'
            : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12]'
        }`}
      >
        <span className="truncate">{segment.label}</span>
      </span>
    </button>
  );
};

const Focus: React.FC<{ segment: TrySegment | undefined }> = ({ segment }) => (
  <div className="w-[112px] shrink-0 flex flex-col gap-0.5 min-w-0">
    <span className="text-[13px] text-white/85 truncate">{segment?.label}</span>
    {!!segment?.tags?.length && (
      <span className="text-[12px] text-white/50 truncate" data-testid="segment-tags">
        {segment.tags.join(', ')}
      </span>
    )}
  </div>
);

export const SegmentLane: React.FC<{ timeline: TryTimeline }> = ({ timeline }) => {
  const { segments: edits, frame, frames } = timeline;
  const drag = useEdgeDrag(edits.segments, frames, edits.moveEdge);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [tagging, setTagging] = useState<number | null>(null);
  const shown = drag.shown;
  const naming = renaming === null ? undefined : shown[renaming];

  if (!shown.length) return null;

  const showMenu = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    edits.select(index);
    setMenu({ x: e.clientX, y: e.clientY, index });
  };

  return (
    <div data-testid="segment-lane" className="flex items-center gap-3">
      <Focus segment={shown[edits.selected ?? segmentAt(shown, frame)]} />
      <div className="relative flex-1 min-w-0 h-[28px] rounded-lg bg-[#262626]">
        {shown.map((s, i) => (
          <SegmentBlock
            key={`${s.start}-${s.end}`}
            segment={s}
            frames={frames}
            selected={edits.selected === i}
            onPick={() => {
              edits.select(i);
              timeline.seek(s.start);
            }}
            onRename={() => setRenaming(i)}
            onMenu={showMenu(i)}
          />
        ))}
        {shown.slice(1).map((s, j) => (
          <div
            key={`edge-${j}`}
            data-testid="segment-edge"
            className="absolute inset-y-0 z-10 w-[8px] -translate-x-1/2 cursor-col-resize"
            style={{ left: `${framePercent(s.start, frames)}%` }}
            {...drag.handlers(j + 1)}
          />
        ))}
        <div
          className="absolute inset-y-0 z-20 w-px bg-white/85 pointer-events-none"
          style={{ left: `${framePercent(frame, frames)}%` }}
        />
        {naming && renaming !== null && (
          <div
            className="absolute top-0.5 z-30 flex"
            style={{
              width: RENAME_WIDTH,
              left: `min(${framePercent(naming.start, frames)}%, calc(100% - ${RENAME_WIDTH}px))`,
            }}
          >
            <RenameField
              name={naming.label}
              onDone={(name) => {
                setRenaming(null);

                if (name) edits.rename(renaming, name);
              }}
            />
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: TAG_ITEM, onSelect: () => setTagging(menu.index) },
            renameEntry(() => setRenaming(menu.index)),
          ]}
          onClose={() => setMenu(null)}
        />
      )}
      {tagging !== null && (
        <TagSheet
          onTag={(tag) => {
            setTagging(null);
            edits.tag(tagging, tag);
          }}
          onClose={() => setTagging(null)}
        />
      )}
    </div>
  );
};
