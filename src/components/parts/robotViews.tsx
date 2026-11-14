import React, { useState } from 'react';
import {
  BrowseRow,
  ContextMenu,
  type ContextMenuEntry,
  PlusIcon,
  PreviewImage,
  confirmAction,
  deleteEntry,
} from '../../design-system';
import { ROBOT_DRAG_TYPE } from '../../data/dnd';
import { forgetImportedRobot } from '../../utils/robotPreview';
import { plural } from '../../../electron/plural.mjs';
import { ROBOT_GROUPS, robotsIn, type RobotEntry, type RobotGroup } from './robotEntries';
import { ACTIVE_FILL, RESTING_FILL, Thumb } from './rows';

const robotDrag = (robot: RobotEntry) => (e: React.DragEvent) => {
  e.dataTransfer.setData(ROBOT_DRAG_TYPE, JSON.stringify({ url: robot.preset.url, name: robot.preset.title }));
  e.dataTransfer.effectAllowed = 'copy';

  const img = (e.currentTarget as HTMLElement).querySelector('img');

  if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
};

const useFallbackImage = (images: Array<string | undefined>) => {
  const sources = images.filter((s): s is string => !!s);
  const [failed, setFailed] = useState(0);

  return { src: sources[failed] ?? '', onError: () => setFailed((n) => n + 1) };
};

const RobotTile: React.FC<{
  robot: RobotEntry;
  disabled: boolean;
  onInsert: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}> = ({ robot, disabled, onInsert, onContextMenu }) => {
  const image = useFallbackImage(robot.images);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onInsert}
      onContextMenu={onContextMenu}
      draggable={!disabled}
      onDragStart={robotDrag(robot)}
      className="group w-full text-left cursor-default active:scale-[0.98] transition-transform duration-150"
    >
      <div className="preview aspect-[4/3] flex items-center justify-center">
        <PreviewImage src={image.src} onError={image.onError} zoom className="p-1.5" />
      </div>
      <div className="px-0.5 pt-2">
        <div className="text-[13px] font-medium text-white/90 truncate">{robot.preset.title}</div>
        <div className="text-[12px] text-white/50 truncate">{robot.meta}</div>
      </div>
    </button>
  );
};

const icon = 'w-3.5 h-3.5';

const importedMenu = (robot: RobotEntry, onInsert: () => void): ContextMenuEntry[] => [
  { label: 'Insert', icon: <PlusIcon className={icon} />, onSelect: onInsert },
  { divider: true },
  deleteEntry(() =>
    confirmAction({
      title: `Delete ${robot.preset.title}?`,
      onConfirm: () => forgetImportedRobot(robot.preset.url),
    }),
  ),
];

export const RobotGrid: React.FC<{
  robots: RobotEntry[];
  busy: boolean;
  onInsert: (robot: RobotEntry) => void;
}> = ({ robots, busy, onInsert }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; entries: ContextMenuEntry[] } | null>(null);

  const openMenu = (e: React.MouseEvent, robot: RobotEntry) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, entries: importedMenu(robot, () => onInsert(robot)) });
  };

  return (
    <div className="grid grid-cols-2 gap-x-[8px] gap-y-[12px] px-[12px] pt-1 pb-4">
      {robots.map((r) => (
        <RobotTile
          key={r.key}
          robot={r}
          disabled={busy}
          onInsert={() => onInsert(r)}
          onContextMenu={r.imported ? (e) => openMenu(e, r) : undefined}
        />
      ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};

export const RobotRow: React.FC<{
  robot: RobotEntry;
  index: number;
  active: boolean;
  disabled: boolean;
  onHover: () => void;
  onInsert: () => void;
}> = ({ robot, index, active, disabled, onHover, onInsert }) => {
  const image = useFallbackImage(robot.images);

  return (
    <button
      type="button"
      data-result={index}
      disabled={disabled}
      onPointerEnter={onHover}
      onClick={onInsert}
      draggable={!disabled}
      onDragStart={robotDrag(robot)}
      className={`w-full flex items-center gap-3 h-[52px] px-1.5 rounded-xl text-left cursor-default bg-[var(--result-row-fill)] transition-colors ${active ? ACTIVE_FILL : RESTING_FILL}`}
    >
      <div className="preview preview-sm w-12 h-[32px] shrink-0">
        <PreviewImage src={image.src} onError={image.onError} className="p-0.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-white/90 truncate">{robot.preset.title}</div>
        <div className="text-[12px] text-white/50 truncate">{robot.meta}</div>
      </div>
    </button>
  );
};

export const RobotGroupRows: React.FC<{ robots: RobotEntry[]; onOpen: (group: RobotGroup) => void }> = ({
  robots,
  onOpen,
}) =>
  ROBOT_GROUPS.map((group) => {
    const list = robotsIn(robots, group);

    if (!list.length) return null;

    return (
      <BrowseRow
        key={group}
        title={group}
        meta={plural(list.length, 'robot')}
        thumb={<Thumb url={list[0].images.find(Boolean)} className="w-12 h-[32px] shrink-0" />}
        onOpen={() => onOpen(group)}
      />
    );
  });
