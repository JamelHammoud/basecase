import React, { useRef, useState } from 'react';
import {
  ContextMenu,
  FloatingField,
  RenameField,
  renameEntry,
  tagEntry,
  type ContextMenuEntry,
} from '../../design-system';
import { moveBoundary, segmentAt, type TrySegment } from '../../cases/tryLabels';
import type { TryLabelsState } from '../../workspace/useTryLabels';
import { FlagMark } from './FlagMark';
import { useSegmentDrag } from './useSegmentDrag';

interface SegmentLaneProps {
  labels: TryLabelsState;
  frame: number;
  frames: number;
  jointName: (id: string) => string;
  onSeek: (frame: number) => void;
  onEdited: () => void;
}

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

const share = (frame: number, frames: number) => `${(Math.min(frame, frames - 1) / Math.max(frames - 1, 1)) * 100}%`;

interface BlockProps {
  segment: TrySegment;
  frames: number;
  selected: boolean;
  renaming: boolean;
  onRename: (label: string | null) => void;
  onPress: (e: React.PointerEvent) => void;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
}

const Block: React.FC<BlockProps> = ({ segment, frames, selected, renaming, ...on }) => (
  <div
    data-testid="segment"
    data-label={segment.label}
    data-from={segment.from}
    data-to={segment.to}
    className={`absolute inset-y-0 px-0.5 flex items-stretch ${renaming ? 'z-10 min-w-[160px]' : ''}`}
    style={{
      left: share(segment.from, frames),
      width: `calc(${share(segment.to, frames)} - ${share(segment.from, frames)})`,
    }}
    onPointerDown={on.onPress}
    onDoubleClick={on.onOpen}
    onContextMenu={on.onMenu}
  >
    {renaming ? (
      <RenameField name={segment.label} label="Segment" className="h-[32px]" onDone={on.onRename} />
    ) : (
      <div
        className={`flex-1 min-w-0 rounded-[6px] px-1.5 flex items-center text-[12px] truncate transition-colors ${
          selected
            ? 'bg-[#0d99ff]/25 text-white ring-[1.5px] ring-inset ring-[#0d99ff]/70'
            : 'bg-white/[0.07] text-white/90'
        }`}
      >
        <span className="truncate">{segment.label}</span>
      </div>
    )}
  </div>
);

export const SegmentLane: React.FC<SegmentLaneProps> = ({ labels, frame, frames, jointName, onSeek, onEdited }) => {
  const track = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [tagging, setTagging] = useState<{ x: number; y: number; index: number } | null>(null);
  const edited = (done: boolean) => done && onEdited();
  const { drag, handle, frameAt } = useSegmentDrag({
    track,
    frames,
    onMove: (index, at) => edited(labels.move(index, at)),
  });
  const shown = (drag && moveBoundary(labels.segments, drag.index, drag.frame)) || labels.segments;
  const here = shown[segmentAt(shown, frame)];

  if (!shown.length) return null;

  const openMenu = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    labels.select(index);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [
        renameEntry(() => setRenaming(index)),
        tagEntry(() => setTagging({ x: e.clientX, y: e.clientY, index })),
      ],
    });
  };

  return (
    <div data-testid="segment-lane" className="flex items-center gap-3 cursor-default">
      <div className="w-[112px] shrink-0 flex items-center gap-1.5 min-w-0">
        <span className="text-[13px] text-white/90 truncate" data-testid="segment-here">
          {here?.label}
        </span>
        <FlagMark flags={labels.flags} jointName={jointName} />
      </div>
      <div
        ref={track}
        className="relative flex-1 min-w-0 h-[32px]"
        onPointerDown={(e) => {
          labels.select(null);
          onSeek(frameAt(e.clientX));
        }}
      >
        {shown.map((segment, i) => (
          <Block
            key={`${segment.from}-${i}`}
            segment={segment}
            frames={frames}
            selected={labels.selected === i}
            renaming={renaming === i}
            onPress={(e) => {
              e.stopPropagation();
              labels.select(i);
              onSeek(frameAt(e.clientX));
            }}
            onOpen={() => setRenaming(i)}
            onMenu={openMenu(i)}
            onRename={(label) => {
              setRenaming(null);
              edited(label !== null && labels.rename(i, label));
            }}
          />
        ))}
        {shown.slice(1).map((segment, i) => (
          <div
            key={`edge-${segment.from}`}
            data-testid="segment-edge"
            className="absolute inset-y-0 w-2 -ml-1 z-[5] cursor-col-resize"
            style={{ left: share(segment.from, frames) }}
            {...handle(i + 1)}
          />
        ))}
        <div
          className="absolute inset-y-0 w-px bg-white/70 pointer-events-none"
          style={{ left: share(frame, frames) }}
        />
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
      {tagging && (
        <FloatingField
          x={tagging.x}
          y={tagging.y}
          name={(shown[tagging.index]?.tags ?? []).join(', ')}
          label="Tags"
          onDone={(text) => {
            setTagging(null);
            edited(text !== null && labels.tag(tagging.index, text));
          }}
        />
      )}
    </div>
  );
};
