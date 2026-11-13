import React from 'react';
import {
  ChevronRightIcon,
  GroupIcon,
  HiddenIcon,
  IconButton,
  LockIcon,
  LookIcon,
  UnlockIcon,
} from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { hasPrimaryModifier } from '../../utils/os';

const ROW =
  'group relative h-8 rounded-lg flex items-center text-[13px] cursor-default [transition-property:color,--layer-row-fill] duration-150 ease-in-out bg-[var(--layer-row-fill)]';
const SELECTED = '[--layer-row-fill:color-mix(in_srgb,#0d99ff_18%,var(--color-panel-bg))] text-white';
const RESTING =
  '[--layer-row-fill:var(--color-panel-bg)] hover:[--layer-row-fill:color-mix(in_srgb,white_5%,var(--color-panel-bg))]';
const ACTIONS_FADE = 'linear-gradient(to right, transparent, var(--layer-row-fill) 32px)';
const REVEAL = 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100';
const CLICKABLE_ON_REVEAL =
  'pointer-events-none group-hover:pointer-events-auto group-has-[:focus-visible]:pointer-events-auto';
const COLLAPSED_UNTIL_REVEAL = 'hidden group-hover:flex group-has-[:focus-visible]:flex';

const rowTone = (selected: boolean, rest: string) => (selected ? SELECTED : `${RESTING} ${rest}`);

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
  pinned: boolean;
  onClick: () => void;
  title: string;
  icons: [React.ReactNode, React.ReactNode];
}> = ({ on, pinned, onClick, title, icons }) => {
  const button = (
    <IconButton
      icon={on ? icons[0] : icons[1]}
      title={title}
      variant="ghost"
      size="xs"
      className={on ? 'pointer-events-auto' : CLICKABLE_ON_REVEAL}
      onClick={onClick}
    />
  );

  return pinned && !on ? <span className={COLLAPSED_UNTIL_REVEAL}>{button}</span> : button;
};

const RowActions: React.FC<{ part: ScenePart; onToggle: PartRowProps['onToggle'] }> = ({ part, onToggle }) => {
  const pinned = part.locked || !part.visible;

  return (
    <div
      className={`absolute inset-y-0 right-0 flex items-center pl-8 pr-1 rounded-r-lg pointer-events-none transition-opacity ${
        pinned ? '' : REVEAL
      }`}
      style={{ backgroundImage: ACTIONS_FADE }}
      onClick={(e) => e.stopPropagation()}
    >
      <RowToggle
        on={part.locked}
        pinned={pinned}
        onClick={() => onToggle(part.id, 'locked')}
        title={part.locked ? 'Unlock' : 'Lock'}
        icons={[<LockIcon key="on" className="w-3.5 h-3.5" />, <UnlockIcon key="off" className="w-3.5 h-3.5" />]}
      />
      <RowToggle
        on={!part.visible}
        pinned={pinned}
        onClick={() => onToggle(part.id, 'visible')}
        title={part.visible ? 'Hide' : 'Show'}
        icons={[<HiddenIcon key="on" className="w-3.5 h-3.5" />, <LookIcon key="off" className="w-3.5 h-3.5" />]}
      />
    </div>
  );
};

const Chevron: React.FC<{ collapsed: boolean; onToggle: () => void }> = ({ collapsed, onToggle }) => (
  <button
    type="button"
    aria-label={collapsed ? 'Expand' : 'Collapse'}
    aria-expanded={!collapsed}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-white/50 hover:text-white/80 cursor-default"
  >
    <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`} />
  </button>
);

const INDENT_STEP = 22;

const rowIndent = (depth: number, withChevron: boolean) => (withChevron ? 4 : 10) + depth * INDENT_STEP;

export interface PartRowProps {
  part: ScenePart;
  depth: number;
  operandOf?: string;
  collapsed?: boolean;
  selected: boolean;
  dimmed: boolean;
  editing: boolean;
  onClick: (part: ScenePart, additive: boolean) => void;
  onEdit: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (part: ScenePart, x: number, y: number) => void;
  onToggle: (id: string, flag: 'visible' | 'locked') => void;
  onToggleCollapsed: (id: string) => void;
}

export const PartRow: React.FC<PartRowProps> = ({
  part,
  depth,
  operandOf,
  collapsed,
  selected,
  dimmed,
  editing,
  ...on
}) => {
  const topLevel = !operandOf;
  const renaming = topLevel && editing;

  return (
    <li
      data-layer-row={`part:${part.id}`}
      data-operand-of={operandOf}
      onClick={(e) => {
        e.stopPropagation();
        on.onClick(part, e.shiftKey || hasPrimaryModifier(e));
      }}
      onDoubleClick={topLevel ? () => on.onEdit(part.id) : undefined}
      onContextMenu={(e) => {
        e.preventDefault();

        if (topLevel) on.onContextMenu(part, e.clientX, e.clientY);
      }}
      style={{ paddingLeft: rowIndent(depth, collapsed !== undefined) }}
      className={`${ROW} pr-2.5 gap-2 ${rowTone(selected, 'text-white/80')} ${dimmed ? 'text-white/50' : ''}`}
    >
      {collapsed !== undefined && <Chevron collapsed={collapsed} onToggle={() => on.onToggleCollapsed(part.id)} />}
      <PartGlyph part={part} />
      {renaming ? (
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
      {topLevel && !editing && <RowActions part={part} onToggle={on.onToggle} />}
    </li>
  );
};

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
    data-layer-row={`group:${id}`}
    onClick={(e) => {
      e.stopPropagation();
      on.onSelect(memberIds, e.shiftKey || hasPrimaryModifier(e));
    }}
    onDoubleClick={() => on.onEdit(id)}
    onContextMenu={(e) => {
      e.preventDefault();
      on.onContextMenu(memberIds, selected, { x: e.clientX, y: e.clientY });
    }}
    className={`${ROW} pl-1 pr-2 gap-1.5 font-medium ${rowTone(selected, 'text-white/85')}`}
  >
    <Chevron collapsed={collapsed} onToggle={() => on.onToggleCollapsed(id)} />
    <GroupIcon className="w-3.5 h-3.5 text-white/50 shrink-0" />
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
    <span className="text-[12px] text-white/50 tabular">{memberIds.length}</span>
  </li>
);
