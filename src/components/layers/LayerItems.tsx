import React from 'react';
import { ChevronRight, Eye, EyeOff, Group, Lock, Unlock } from 'lucide-react';
import type { ScenePart } from '../../types/robotics';

const ROW = 'group h-8 rounded-lg flex items-center text-[13px] cursor-default transition-colors';

const rowTone = (selected: boolean, rest: string) => (selected ? 'bg-[#0d99ff]/[0.18] text-white' : rest);

export const RenameInput: React.FC<{ current: string; onCommit: (name: string) => void; onCancel: () => void }> = ({
  current,
  onCommit,
  onCancel,
}) => (
  <input
    autoFocus
    defaultValue={current}
    onFocus={(e) => e.target.select()}
    onClick={(e) => e.stopPropagation()}
    onBlur={(e) => onCommit(e.target.value.trim() || current)}
    onKeyDown={(e) => {
      if (e.key === 'Enter') e.currentTarget.blur();

      if (e.key === 'Escape') onCancel();
    }}
    className="flex-1 min-w-0 h-6 px-1 -mx-1 rounded bg-black/30 ring-1 ring-[#0d99ff] outline-none text-white"
  />
);

const PartGlyph: React.FC<{ part: ScenePart }> = ({ part }) => {
  if (part.kind === 'image_plane' && part.imageDataUrl) {
    return (
      <img
        src={part.imageDataUrl}
        alt=""
        className="w-4 h-4 rounded-[4px] object-cover shrink-0 ring-1 ring-white/15"
      />
    );
  }

  if (part.role === 'cutout') {
    return <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-red-400" aria-label="Cutout" />;
  }

  if (part.role === 'reference') {
    return (
      <span className="w-3 h-3 shrink-0 flex items-center justify-center">
        <span className="w-px h-3 bg-cyan-400" />
      </span>
    );
  }

  return (
    <span
      className="w-3 h-3 rounded-[4px] shrink-0 ring-1 ring-inset ring-white/20"
      style={{ backgroundColor: part.color }}
    />
  );
};

const RowToggle: React.FC<{
  on: boolean;
  onClick: () => void;
  title: string;
  icons: [React.ReactNode, React.ReactNode];
}> = ({ on, onClick, title, icons }) => (
  <button
    type="button"
    aria-label={title}
    onClick={onClick}
    className={`w-7 h-7 rounded-md flex items-center justify-center cursor-default transition-opacity hover:bg-white/[0.08] ${
      on ? 'text-white/60 opacity-100' : 'text-white/40 hover:text-white/80 opacity-0 group-hover:opacity-100'
    }`}
  >
    {on ? icons[0] : icons[1]}
  </button>
);

export interface PartRowProps {
  part: ScenePart;
  inGroup: boolean;
  selected: boolean;
  dimmed: boolean;
  editing: boolean;
  onClick: (part: ScenePart, additive: boolean) => void;
  onEdit: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (part: ScenePart, x: number, y: number) => void;
  onToggle: (id: string, flag: 'visible' | 'locked') => void;
}

export const PartRow: React.FC<PartRowProps> = ({ part, inGroup, selected, dimmed, editing, ...on }) => (
  <li
    onClick={(e) => {
      e.stopPropagation();
      on.onClick(part, e.shiftKey || e.metaKey);
    }}
    onDoubleClick={() => on.onEdit(part.id)}
    onContextMenu={(e) => {
      e.preventDefault();
      on.onContextMenu(part, e.clientX, e.clientY);
    }}
    className={`${ROW} ${inGroup ? 'pl-8' : 'pl-2.5'} pr-1 gap-2 ${rowTone(selected, 'text-white/80 hover:bg-white/[0.05]')} ${
      dimmed ? 'text-white/35' : ''
    }`}
  >
    <PartGlyph part={part} />
    {editing ? (
      <RenameInput
        current={part.name}
        onCommit={(name) => {
          on.onRename(part.id, name);
          on.onEdit(null);
        }}
        onCancel={() => on.onEdit(null)}
      />
    ) : (
      <span className="flex-1 truncate">{part.name}</span>
    )}
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <RowToggle
        on={part.locked}
        onClick={() => on.onToggle(part.id, 'locked')}
        title={part.locked ? 'Unlock' : 'Lock'}
        icons={[<Lock key="on" className="w-3.5 h-3.5" />, <Unlock key="off" className="w-3.5 h-3.5" />]}
      />
      <RowToggle
        on={!part.visible}
        onClick={() => on.onToggle(part.id, 'visible')}
        title={part.visible ? 'Hide' : 'Show'}
        icons={[<EyeOff key="on" className="w-3.5 h-3.5" />, <Eye key="off" className="w-3.5 h-3.5" />]}
      />
    </div>
  </li>
);

export interface GroupRowProps {
  id: string;
  name: string;
  memberIds: string[];
  selected: boolean;
  collapsed: boolean;
  editing: boolean;
  onSelect: (ids: string[], additive: boolean) => void;
  onToggleCollapsed: (id: string) => void;
  onEdit: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (ids: string[], selected: boolean, at: { x: number; y: number }) => void;
}

export const GroupRow: React.FC<GroupRowProps> = ({ id, name, memberIds, selected, collapsed, editing, ...on }) => (
  <li
    onClick={(e) => {
      e.stopPropagation();
      on.onSelect(memberIds, e.shiftKey || e.metaKey);
    }}
    onDoubleClick={() => on.onEdit(id)}
    onContextMenu={(e) => {
      e.preventDefault();
      on.onContextMenu(memberIds, selected, { x: e.clientX, y: e.clientY });
    }}
    className={`${ROW} pl-1 pr-2 gap-1.5 font-medium ${rowTone(selected, 'text-white/85 hover:bg-white/[0.05]')}`}
  >
    <button
      type="button"
      aria-label={collapsed ? 'Expand group' : 'Collapse group'}
      onClick={(e) => {
        e.stopPropagation();
        on.onToggleCollapsed(id);
      }}
      className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white/80 cursor-default"
    >
      <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`} />
    </button>
    <Group className="w-3.5 h-3.5 text-white/50 shrink-0" />
    {editing ? (
      <RenameInput
        current={name}
        onCommit={(next) => {
          on.onRename(id, next);
          on.onEdit(null);
        }}
        onCancel={() => on.onEdit(null)}
      />
    ) : (
      <span className="flex-1 truncate">{name}</span>
    )}
    <span className="text-[12px] text-white/35 tabular">{memberIds.length}</span>
  </li>
);
